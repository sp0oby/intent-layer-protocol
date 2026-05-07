/**
 * Pure event handlers — decode a parsed log into the right repository call.
 *
 * Each handler is unit-testable without a chain or DB: the test passes a
 * synthetic ethers `LogDescription`, a mock repo, and asserts the method
 * the handler invokes.
 *
 * Source events (ABI verified by tests/abis.test.ts):
 *   IntentSettler:  IntentSubmitted, IntentCancelled, IntentMatched,
 *                   AuctionOpened, IntentLocked, IntentSettled, IntentRefunded
 *   SolverAuction:  AuctionWindowSet, ProposalSubmitted, WinnerSelected
 */

import type {LogDescription} from 'ethers';
import type {OrderBookRepository} from '../db/repository.js';

/** Subset of the fields ethers attaches to every Log we observe. */
export interface LogContext {
  blockNumber: number;
  blockTimestamp: number;
  transactionHash: string;
}

export type Handler = (parsed: LogDescription, ctx: LogContext, repo: OrderBookRepository) => Promise<void>;

/** Helper: ethers v6 returns args as a Result with both name + index access.
 *  We use named access for clarity. */
const arg = (parsed: LogDescription, name: string): unknown => parsed.args[name];

const asString = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error(`expected string, got ${typeof v}`);
  return v;
};

const asNumber = (v: unknown): number => {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  throw new Error(`expected number, got ${typeof v}`);
};

const asDecimalString = (v: unknown): string => {
  if (typeof v === 'bigint') return v.toString(10);
  if (typeof v === 'string') return v;
  throw new Error(`expected bigint, got ${typeof v}`);
};

/** IntentSettler.IntentSubmitted(intentHash, user, intent). */
export const handleIntentSubmitted: Handler = async (parsed, ctx, repo) => {
  const intentHash = asString(arg(parsed, 'intentHash'));
  const user = asString(arg(parsed, 'user'));
  const intentTuple = arg(parsed, 'intent');
  if (!intentTuple || typeof intentTuple !== 'object') throw new Error('IntentSubmitted: missing intent tuple');
  // Tuple access: indexed by either position or name. ethers exposes both;
  // we go positional because the named view requires the ABI to set
  // `internalType` on every field, and tuple naming has bitten projects.
  const t = intentTuple as ReadonlyArray<unknown>;
  await repo.insertIntent({
    intentHash,
    user,
    sourceChainId: asNumber(t[0]),
    sourceToken: asString(t[1]),
    sourceAmount: asDecimalString(t[2]),
    destChainId: asNumber(t[3]),
    destToken: asString(t[4]),
    minDestAmount: asDecimalString(t[5]),
    // t[6] is `user`; mirrored by indexed `user` arg above.
    refundTo: asString(t[7]),
    deadline: asNumber(t[8]),
    nonce: asDecimalString(t[9]),
    submittedAtBlockTs: ctx.blockTimestamp,
    submitTxHash: ctx.transactionHash,
  });
};

/** IntentSettler.IntentCancelled(intentHash). */
export const handleIntentCancelled: Handler = async (parsed, ctx, repo) => {
  await repo.markCancelled({
    intentHash: asString(arg(parsed, 'intentHash')),
    cancelTxHash: ctx.transactionHash,
  });
};

/** IntentSettler.IntentMatched(localHash, remoteHash). The pair is symmetric
 *  on the source chain — the destination chain emits IntentSettled on its
 *  side directly when EXECUTE_MATCH lands (Phase 1 atomic settlement).
 *  The matches row carries the *source* chain id; the indexer running on
 *  the source chain knows its own chainid via the chain config. */
export const handleIntentMatched =
  (sourceChainId: number, destChainId: number): Handler =>
  async (parsed, ctx, repo) => {
    await repo.markMatched({
      localHash: asString(arg(parsed, 'localHash')),
      remoteHash: asString(arg(parsed, 'remoteHash')),
      matchTimestamp: ctx.blockTimestamp,
      sourceChainId,
      destChainId,
      executeMatchTxHash: ctx.transactionHash,
    });
  };

/** IntentSettler.AuctionOpened(intentHash, auctionDeadline). */
export const handleAuctionOpened: Handler = async (parsed, _ctx, repo) => {
  await repo.markAuctioning({
    intentHash: asString(arg(parsed, 'intentHash')),
    auctionDeadline: asNumber(arg(parsed, 'auctionDeadline')),
  });
};

/** IntentSettler.IntentLocked(intentHash). Reserved Phase 2B state — never
 *  fired by the Phase 1 atomic settlement path, but the handler exists so
 *  forward-compat redeploys don't drop the event. */
export const handleIntentLocked: Handler = async () => {
  // Intentional no-op for Phase 1.
};

/** IntentSettler.IntentSettled(intentHash, recipient, amount). */
export const handleIntentSettled: Handler = async (parsed, ctx, repo) => {
  await repo.markSettled({
    intentHash: asString(arg(parsed, 'intentHash')),
    settleTxHash: ctx.transactionHash,
    blockTimestamp: ctx.blockTimestamp,
  });
};

/** IntentSettler.IntentRefunded(intentHash, recipient, amount). */
export const handleIntentRefunded: Handler = async (parsed, ctx, repo) => {
  await repo.markRefunded({
    intentHash: asString(arg(parsed, 'intentHash')),
    refundTxHash: ctx.transactionHash,
    blockTimestamp: ctx.blockTimestamp,
  });
};

/** SolverAuction.AuctionWindowSet(intentHash, closeTime).
 *  Identical observation to AuctionOpened on the settler side; this handler
 *  is the auction-contract perspective. We update the same row. */
export const handleAuctionWindowSet: Handler = async (parsed, _ctx, repo) => {
  await repo.markAuctioning({
    intentHash: asString(arg(parsed, 'intentHash')),
    auctionDeadline: asNumber(arg(parsed, 'closeTime')),
  });
};

/** SolverAuction.ProposalSubmitted(intentHash, solver, proposedOutputAmount).
 *  The event itself does NOT carry the signature or fee — those come from
 *  the on-chain proposal struct (or the API ingest path). The indexer
 *  records the bid as observed; the API writes the full row when the solver
 *  POSTs. We use ON CONFLICT DO NOTHING so the event handler is safe to run
 *  before or after the API insert. The fee / signature fields are filled in
 *  by the API path; if only the event has been seen, those fields stay 0
 *  / empty until reconciled.
 *
 *  TODO (W4-04): solver auction orchestrator should backfill missing
 *  fee/signature by reading the on-chain proposal at the same index. */
export const handleProposalSubmitted: Handler = async (parsed, _ctx, repo) => {
  await repo.upsertProposal({
    intentHash: asString(arg(parsed, 'intentHash')),
    solver: asString(arg(parsed, 'solver')),
    proposedOutputAmount: asDecimalString(arg(parsed, 'proposedOutputAmount')),
    solverFeeBps: 0,
    signature: '0x',
  });
};

/** SolverAuction.WinnerSelected(intentHash, solver, outputAmount). */
export const handleWinnerSelected: Handler = async (parsed, _ctx, repo) => {
  await repo.markProposalWinner({
    intentHash: asString(arg(parsed, 'intentHash')),
    solver: asString(arg(parsed, 'solver')),
  });
};

export interface ContractHandlers {
  [eventName: string]: Handler;
}

export const intentSettlerHandlers = (sourceChainId: number, destChainId: number): ContractHandlers => ({
  IntentSubmitted: handleIntentSubmitted,
  IntentCancelled: handleIntentCancelled,
  IntentMatched: handleIntentMatched(sourceChainId, destChainId),
  AuctionOpened: handleAuctionOpened,
  IntentLocked: handleIntentLocked,
  IntentSettled: handleIntentSettled,
  IntentRefunded: handleIntentRefunded,
});

export const solverAuctionHandlers = (): ContractHandlers => ({
  AuctionWindowSet: handleAuctionWindowSet,
  ProposalSubmitted: handleProposalSubmitted,
  WinnerSelected: handleWinnerSelected,
});
