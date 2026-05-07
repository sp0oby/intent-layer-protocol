/**
 * Concrete on-chain submitters that turn the matching loop and auction
 * orchestrator's abstract `MatchSubmitter` / `AuctionSubmitter` interfaces
 * into real ethers transactions against IntentSettler and SolverAuction.
 *
 * Design choices:
 *   - Per-chain factory: build one bundle per chain because each chain has
 *     its own RPC, signer, and contract addresses.
 *   - LZ fee quoting: `executeMatching` is payable; we call the contract's
 *     `quoteMatching(localHash, remoteHash)` view first and forward the
 *     returned native fee as `msg.value`. Excess is refunded by LayerZero
 *     to the message-refundAddress (the caller — i.e. the relayer wallet).
 *   - Failure classification: revert errors common in normal operation
 *     (`AlreadySettled`, `EmptyAuction`, `AlreadyAnnounced`,
 *     `AuctionStillOpen`) are returned as `{skipped}` so the
 *     orchestrator's logs distinguish "expected revert" from real
 *     "we should investigate" failures.
 */

import {Contract, type Signer} from 'ethers';
import IntentSettlerAbi from '../abis/IntentSettler.json' with {type: 'json'};
import SolverAuctionAbi from '../abis/SolverAuction.json' with {type: 'json'};
import type {MatchSubmitter} from './matching-loop.js';
import type {AuctionSubmitter} from './auction-orchestrator.js';

export interface ChainContext {
  chainId: number;
  signer: Signer;
  intentSettler: string;
  solverAuction: string;
}

export interface ChainSubmitters {
  matchSubmitter: MatchSubmitter;
  openAuctionSubmitter: AuctionSubmitter;
  finalizeAuctionSubmitter: AuctionSubmitter;
}

const SKIP_REASONS = new Set([
  'AlreadySettled',
  'EmptyAuction',
  'AlreadyAnnounced',
  'AuctionStillOpen',
  'AuctionNotOpen',
  'AuctionAlreadyOpen',
  'InvalidState',
  'AuctionDelayNotElapsed',
]);

/** Best-effort revert-reason extraction. ethers v6 attaches a parsed
 *  `revert` to the error when the ABI knows the custom error; otherwise
 *  we fall back to the message string. */
function classifyError(err: unknown): {kind: 'skip' | 'error'; reason: string} {
  const message = err instanceof Error ? err.message : String(err);
  for (const name of SKIP_REASONS) {
    if (message.includes(name)) return {kind: 'skip', reason: name};
  }
  type EthersErr = {revert?: {name?: string}; shortMessage?: string};
  const e = err as EthersErr;
  if (e?.revert?.name && SKIP_REASONS.has(e.revert.name)) {
    return {kind: 'skip', reason: e.revert.name};
  }
  return {kind: 'error', reason: e?.shortMessage ?? message};
}

export function buildChainSubmitters(ctx: ChainContext): ChainSubmitters {
  const settler = new Contract(ctx.intentSettler, IntentSettlerAbi as never, ctx.signer);
  const auction = new Contract(ctx.solverAuction, SolverAuctionAbi as never, ctx.signer);

  const matchSubmitter: MatchSubmitter = async ({sourceChainId, localHash, remoteHash}) => {
    if (sourceChainId !== ctx.chainId) {
      return {error: `chain mismatch: submitter is for ${ctx.chainId}, requested ${sourceChainId}`};
    }
    try {
      const fee = (await settler.quoteMatching!(localHash, remoteHash)) as {nativeFee: bigint; lzTokenFee: bigint};
      const tx = await settler.executeMatching!(localHash, remoteHash, {value: fee.nativeFee});
      const receipt = await tx.wait();
      return {txHash: receipt?.hash ?? tx.hash};
    } catch (err) {
      const classified = classifyError(err);
      if (classified.kind === 'skip') return {error: `skipped: ${classified.reason}`};
      return {error: classified.reason};
    }
  };

  const openAuctionSubmitter: AuctionSubmitter = async ({sourceChainId, intentHash}) => {
    if (sourceChainId !== ctx.chainId) {
      return {error: `chain mismatch: submitter is for ${ctx.chainId}, requested ${sourceChainId}`};
    }
    try {
      const tx = await settler.openAuction!(intentHash);
      const receipt = await tx.wait();
      return {txHash: receipt?.hash ?? tx.hash};
    } catch (err) {
      const classified = classifyError(err);
      if (classified.kind === 'skip') return {skipped: classified.reason};
      return {error: classified.reason};
    }
  };

  const finalizeAuctionSubmitter: AuctionSubmitter = async ({sourceChainId, intentHash}) => {
    if (sourceChainId !== ctx.chainId) {
      return {error: `chain mismatch: submitter is for ${ctx.chainId}, requested ${sourceChainId}`};
    }
    try {
      const tx = await auction.executeWinningProposal!(intentHash);
      const receipt = await tx.wait();
      return {txHash: receipt?.hash ?? tx.hash};
    } catch (err) {
      const classified = classifyError(err);
      if (classified.kind === 'skip') return {skipped: classified.reason};
      return {error: classified.reason};
    }
  };

  return {matchSubmitter, openAuctionSubmitter, finalizeAuctionSubmitter};
}
