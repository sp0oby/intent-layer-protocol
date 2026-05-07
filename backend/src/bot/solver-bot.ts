/**
 * Reference solver bot. Polls the API for AUCTIONING intents, computes a
 * naive proposal (constant markup over the user's `minDestAmount`), signs
 * it against the on-chain SolverAuction.proposalDigest, POSTs the proposal
 * to the API, and submits the signed proposal on-chain via
 * SolverAuction.submitProposal.
 *
 * Pricing:
 *   This is a *reference* bot — production solvers should price against
 *   their own liquidity / spreads / inventory. Here we just offer
 *   `minDestAmount + markupBps`, which always wins price-eligibility
 *   filters but is unlikely to be the winning bid against real solvers.
 *
 * Concurrency / safety:
 *   - Each tick: read the auctioning list, skip intents we have already
 *     bid on, build + sign + POST + on-chain submit, mark seen.
 *   - On-chain submitProposal reverts cleanly if we double-submit
 *     (`AlreadySubmitted`) so the bot is safe against the same intent
 *     appearing across restarts.
 */

import {Contract, type Signer, getBytes} from 'ethers';
import SolverAuctionAbi from '../abis/SolverAuction.json' with {type: 'json'};
import {proposalDigest} from '../services/proposal-verifier.js';

export interface SolverBotConfig {
  apiBaseUrl: string;
  /** Map chainId -> SolverAuction address. */
  solverAuctionByChain: Record<number, string>;
  /** Markup over the user's minDestAmount, in basis points. e.g. 50 = +0.5%. */
  markupBps: number;
  /** Solver's reported fee, in basis points, included in the proposal. */
  feeBps: number;
  pollIntervalMs: number;
}

export interface SolverBotDependencies {
  /** Map chainId -> Signer bound to that chain. The bot uses this to
   *  sign the digest AND submit the on-chain proposal. */
  signersByChain: Record<number, Signer>;
  fetch?: typeof fetch;
  clock?: {now: () => number; sleep: (ms: number) => Promise<void>};
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

interface AuctioningIntent {
  intentHash: string;
  sourceChainId: number;
  destChainId: number;
  sourceAmount: string;
  minDestAmount: string;
  auctionDeadline?: number;
}

const defaultClock = {
  now: () => Date.now(),
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};
const defaultLogger = {
  info: (msg: string, meta?: Record<string, unknown>): void => console.info(`[bot] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>): void => console.warn(`[bot] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>): void => console.error(`[bot] ${msg}`, meta ?? ''),
};

export class SolverBot {
  private readonly config: SolverBotConfig;
  private readonly signersByChain: Record<number, Signer>;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: NonNullable<SolverBotDependencies['clock']>;
  private readonly logger: NonNullable<SolverBotDependencies['logger']>;
  private readonly seen = new Set<string>();
  private running = false;

  constructor(config: SolverBotConfig, deps: SolverBotDependencies) {
    this.config = config;
    this.signersByChain = deps.signersByChain;
    this.fetchImpl = deps.fetch ?? fetch;
    this.clock = deps.clock ?? defaultClock;
    this.logger = deps.logger ?? defaultLogger;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error('tick failed', {error: err instanceof Error ? err.message : String(err)});
      }
      if (!this.running) break;
      await this.clock.sleep(this.config.pollIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }

  /** Single sweep — fetch the auctioning list, bid on each new intent. */
  async tick(): Promise<{bidsSubmitted: number}> {
    const intents = await this.fetchAuctioningIntents();
    let submitted = 0;
    for (const intent of intents) {
      if (this.seen.has(intent.intentHash)) continue;
      const auctionAddress = this.config.solverAuctionByChain[intent.sourceChainId];
      if (!auctionAddress) {
        this.logger.warn('skipping intent — no auction address for chain', {
          intentHash: intent.intentHash,
          chainId: intent.sourceChainId,
        });
        continue;
      }
      const signer = this.signersByChain[intent.sourceChainId];
      if (!signer) {
        this.logger.warn('skipping intent — no signer for chain', {
          intentHash: intent.intentHash,
          chainId: intent.sourceChainId,
        });
        continue;
      }

      const proposedOutputAmount = this.priceOutput(intent.minDestAmount);
      const digest = proposalDigest({
        chainId: intent.sourceChainId,
        auctionAddress,
        intentHash: intent.intentHash,
        proposedOutputAmount,
        solverFeeBps: this.config.feeBps,
      });
      const signature = await signer.signMessage(getBytes(digest));
      // signMessage prefixes the digest with eth_signedMessage; the
      // contract uses raw ECDSA. We sign the raw bytes directly via
      // the signing key when available.
      const rawSig = await this.signRaw(signer, digest);

      const apiResult = await this.postProposal({
        chainId: intent.sourceChainId,
        intentHash: intent.intentHash,
        solver: await signer.getAddress(),
        proposedOutputAmount,
        solverFeeBps: this.config.feeBps,
        signature: rawSig,
      });
      if (!apiResult.ok) {
        this.logger.warn('api rejected proposal', {intentHash: intent.intentHash, status: apiResult.status});
        continue;
      }

      const onChainResult = await this.submitOnChain({
        signer,
        auctionAddress,
        intentHash: intent.intentHash,
        proposedOutputAmount,
        signature: rawSig,
      });
      if (onChainResult.ok) {
        this.seen.add(intent.intentHash);
        submitted += 1;
        this.logger.info('proposal submitted', {intentHash: intent.intentHash, txHash: onChainResult.txHash});
      } else {
        this.logger.warn('on-chain submit failed', {intentHash: intent.intentHash, error: onChainResult.error});
      }
      // Suppress lint: the eth_signedMessage signature is unused here —
      // we keep the call so a wallet that only exposes signMessage still
      // exercises the path. Future improvement: use signing-key directly.
      void signature;
    }
    return {bidsSubmitted: submitted};
  }

  private priceOutput(minDestAmount: string): string {
    const min = BigInt(minDestAmount);
    const markup = (min * BigInt(this.config.markupBps)) / 10_000n;
    return (min + markup).toString(10);
  }

  private async fetchAuctioningIntents(): Promise<AuctioningIntent[]> {
    const url = `${this.config.apiBaseUrl}/api/intents/auctioning`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      this.logger.warn('auctioning fetch failed', {status: res.status});
      return [];
    }
    const body = (await res.json()) as {intents: AuctioningIntent[]};
    return body.intents ?? [];
  }

  private async postProposal(input: {
    chainId: number;
    intentHash: string;
    solver: string;
    proposedOutputAmount: string;
    solverFeeBps: number;
    signature: string;
  }): Promise<{ok: boolean; status: number}> {
    const url = `${this.config.apiBaseUrl}/api/solver/proposals`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(input),
    });
    return {ok: res.ok, status: res.status};
  }

  private async signRaw(signer: Signer, digest: string): Promise<string> {
    // SolverAuction.submitProposal expects a raw-ECDSA signature over the
    // digest (no eth_signedMessage prefix). Wallet exposes a signing key
    // synchronously; if not, we fall back to eth_sign which produces an
    // EIP-191 prefixed sig the contract WILL reject — log loudly so the
    // operator notices and supplies a Wallet (not a hardware signer).
    type WalletLike = {signingKey?: {sign: (hash: Uint8Array) => {serialized: string}}};
    const w = signer as WalletLike;
    if (w.signingKey) {
      return w.signingKey.sign(getBytes(digest)).serialized;
    }
    this.logger.error('signer does not expose signingKey — raw ECDSA signing unavailable');
    return signer.signMessage(getBytes(digest));
  }

  private async submitOnChain(input: {
    signer: Signer;
    auctionAddress: string;
    intentHash: string;
    proposedOutputAmount: string;
    signature: string;
  }): Promise<{ok: true; txHash: string} | {ok: false; error: string}> {
    try {
      const auction = new Contract(input.auctionAddress, SolverAuctionAbi, input.signer);
      const tx = await auction.submitProposal!(
        input.intentHash,
        input.proposedOutputAmount,
        this.config.feeBps,
        input.signature
      );
      const receipt = await tx.wait();
      return {ok: true, txHash: receipt?.hash ?? tx.hash};
    } catch (err) {
      return {ok: false, error: err instanceof Error ? err.message : String(err)};
    }
  }
}
