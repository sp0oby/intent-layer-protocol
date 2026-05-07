/**
 * Auction orchestrator — the off-chain timer that drives the solver-auction
 * fallback path. Two responsibilities, both backed by injected submitters
 * so the on-chain calls are easy to mock in tests:
 *
 *   1. OPEN — for each PENDING intent older than AUCTION_DELAY (30s by
 *      contract constant), call IntentSettler.openAuction(intentHash) so
 *      the on-chain auction window opens and SolverAuction starts
 *      accepting proposals.
 *
 *   2. FINALIZE — for each AUCTIONING intent whose auction_deadline has
 *      passed, call SolverAuction.executeWinningProposal(intentHash) so
 *      the winner is recorded on-chain. The contract reverts cleanly if
 *      no proposals exist (EmptyAuction) or if already announced
 *      (AlreadyAnnounced) — so the orchestrator can call eagerly without
 *      pre-checking.
 *
 * The contract IS the source of truth for state transitions; the
 * orchestrator just nudges the timer events. If the orchestrator misses a
 * tick, no funds are at risk — at worst the auction opens / finalises a
 * few seconds later, and the indexer catches up.
 */

import type {OrderBookRepository} from '../db/repository.js';

/** Mirrors IntentSettler.AUCTION_DELAY (30 seconds). Sourced from the
 *  contract constant; if the contract value ever changes, update here. */
export const AUCTION_DELAY_SEC = 30;

export type AuctionSubmitter = (input: {
  sourceChainId: number;
  intentHash: string;
}) => Promise<{txHash: string} | {error: string} | {skipped: string}>;

export interface AuctionOrchestratorConfig {
  sourceChainIds: number[];
  pollIntervalMs: number;
  auctionDelaySec?: number;
}

export interface AuctionOrchestratorDependencies {
  repo: OrderBookRepository;
  openSubmitter: AuctionSubmitter;
  finalizeSubmitter: AuctionSubmitter;
  clock?: {now: () => number; sleep: (ms: number) => Promise<void>};
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

const defaultClock = {
  now: () => Date.now(),
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

const defaultLogger = {
  info: (msg: string, meta?: Record<string, unknown>): void => console.info(`[auction] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>): void => console.warn(`[auction] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>): void => console.error(`[auction] ${msg}`, meta ?? ''),
};

export class AuctionOrchestrator {
  private readonly config: Required<AuctionOrchestratorConfig>;
  private readonly repo: OrderBookRepository;
  private readonly openSubmitter: AuctionSubmitter;
  private readonly finalizeSubmitter: AuctionSubmitter;
  private readonly clock: NonNullable<AuctionOrchestratorDependencies['clock']>;
  private readonly logger: NonNullable<AuctionOrchestratorDependencies['logger']>;
  private readonly inFlight = new Set<string>();
  private running = false;

  constructor(config: AuctionOrchestratorConfig, deps: AuctionOrchestratorDependencies) {
    this.config = {
      sourceChainIds: config.sourceChainIds,
      pollIntervalMs: config.pollIntervalMs,
      auctionDelaySec: config.auctionDelaySec ?? AUCTION_DELAY_SEC,
    };
    this.repo = deps.repo;
    this.openSubmitter = deps.openSubmitter;
    this.finalizeSubmitter = deps.finalizeSubmitter;
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

  /** Single sweep across all configured source chains. Returns counts so
   *  tests / metrics can observe the work done. */
  async tick(): Promise<{opens: number; finalizes: number}> {
    const nowSec = Math.floor(this.clock.now() / 1000);
    let opens = 0;
    let finalizes = 0;

    for (const chainId of this.config.sourceChainIds) {
      const toOpen = await this.repo.listEligibleForAuctionOpen(chainId, nowSec, this.config.auctionDelaySec);
      for (const intent of toOpen) {
        if (this.inFlight.has(intent.intentHash)) continue;
        this.inFlight.add(intent.intentHash);
        try {
          const result = await this.openSubmitter({sourceChainId: chainId, intentHash: intent.intentHash});
          if ('txHash' in result) {
            opens += 1;
            this.logger.info('auction opened', {intentHash: intent.intentHash, txHash: result.txHash});
          } else if ('skipped' in result) {
            this.logger.info('auction open skipped', {intentHash: intent.intentHash, reason: result.skipped});
          } else {
            this.logger.warn('auction open rejected', {intentHash: intent.intentHash, error: result.error});
          }
        } catch (err) {
          this.logger.error('auction open threw', {
            intentHash: intent.intentHash,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          this.inFlight.delete(intent.intentHash);
        }
      }

      const toFinalize = await this.repo.listEligibleForAuctionFinalize(chainId, nowSec);
      for (const intent of toFinalize) {
        if (this.inFlight.has(intent.intentHash)) continue;
        this.inFlight.add(intent.intentHash);
        try {
          const result = await this.finalizeSubmitter({sourceChainId: chainId, intentHash: intent.intentHash});
          if ('txHash' in result) {
            finalizes += 1;
            this.logger.info('auction finalized', {intentHash: intent.intentHash, txHash: result.txHash});
          } else if ('skipped' in result) {
            this.logger.info('auction finalize skipped', {intentHash: intent.intentHash, reason: result.skipped});
          } else {
            this.logger.warn('auction finalize rejected', {intentHash: intent.intentHash, error: result.error});
          }
        } catch (err) {
          this.logger.error('auction finalize threw', {
            intentHash: intent.intentHash,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          this.inFlight.delete(intent.intentHash);
        }
      }
    }

    return {opens, finalizes};
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }
}
