/**
 * In-memory OrderBookRepository for the E2E test.
 *
 * Mirrors `pgRepository` semantics but stores everything in JS Maps.
 * Used because pg-mem corrupts bytea round-trips and Docker isn't always
 * running locally. Real Postgres correctness is verified by:
 *   - tests/e2e/pg-smoke.test.ts (migrations parse + CHECK constraints)
 *   - the production code path against a real PG when Docker is up
 *
 * The interface seam is the OrderBookRepository — production swaps in
 * pgRepository(getPool()), the E2E swaps in this. Indexer / matcher /
 * orchestrator / API code is identical.
 */

import type {
  OrderBookRepository,
  IntentEventPayload,
  MatchEventPayload,
  CancelEventPayload,
  SettleEventPayload,
  RefundEventPayload,
  AuctionOpenedPayload,
  ProposalEventPayload,
  WinnerSelectedPayload,
  CursorAdvance,
} from '../../../src/db/repository.js';
import type {IntentRecord, IntentState} from '../../../src/types/intent.js';

interface StoredIntent extends IntentRecord {
  // No extra fields — IntentRecord covers everything the API serializes.
}

interface StoredProposal {
  intentHash: string;
  solver: string;
  proposedOutputAmount: string;
  solverFeeBps: number;
  signature: string;
  proposalDigest?: string;
  winnerAnnounced: boolean;
}

const lower = (s: string): string => s.toLowerCase();

export function createInMemoryRepository(): OrderBookRepository {
  const intents = new Map<string, StoredIntent>();
  const matches: Array<{a: string; b: string; sourceChainId: number; destChainId: number; tx: string}> = [];
  const proposals: StoredProposal[] = [];
  const cursors = new Map<string, number>();

  const cursorKey = (chainId: number, addr: string): string => `${chainId}:${lower(addr)}`;

  const updateState = (intentHash: string, state: IntentState, extras: Partial<StoredIntent> = {}): void => {
    const existing = intents.get(lower(intentHash));
    if (!existing) return;
    intents.set(lower(intentHash), {...existing, state, ...extras});
  };

  return {
    async insertIntent(p: IntentEventPayload) {
      const key = lower(p.intentHash);
      if (intents.has(key)) return; // ON CONFLICT DO NOTHING
      intents.set(key, {
        intentHash: lower(p.intentHash),
        user: lower(p.user),
        refundTo: lower(p.refundTo),
        sourceChainId: p.sourceChainId,
        sourceToken: lower(p.sourceToken),
        sourceAmount: p.sourceAmount,
        destChainId: p.destChainId,
        destToken: lower(p.destToken),
        minDestAmount: p.minDestAmount,
        deadline: p.deadline,
        nonce: p.nonce,
        state: 'PENDING',
        submittedAtBlockTs: p.submittedAtBlockTs,
      });
    },

    async markMatched(p: MatchEventPayload) {
      updateState(p.localHash, 'MATCHED', {matchTimestamp: p.matchTimestamp});
      updateState(p.remoteHash, 'MATCHED', {matchTimestamp: p.matchTimestamp});
      const exists = matches.some(
        (m) =>
          (m.a === lower(p.localHash) && m.b === lower(p.remoteHash)) ||
          (m.a === lower(p.remoteHash) && m.b === lower(p.localHash))
      );
      if (!exists) {
        matches.push({
          a: lower(p.localHash),
          b: lower(p.remoteHash),
          sourceChainId: p.sourceChainId,
          destChainId: p.destChainId,
          tx: lower(p.executeMatchTxHash),
        });
      }
    },

    async markCancelled(p: CancelEventPayload) {
      updateState(p.intentHash, 'CANCELLED');
    },

    async markSettled(p: SettleEventPayload) {
      updateState(p.intentHash, 'SETTLED');
    },

    async markRefunded(p: RefundEventPayload) {
      // Mirror pgRepository's CASE-guarded transition: only flip MATCHED ->
      // REFUNDED. The cancel path emits IntentRefunded too but already set
      // state to CANCELLED via the IntentCancelled handler.
      const existing = intents.get(lower(p.intentHash));
      if (existing && existing.state === 'MATCHED') {
        updateState(p.intentHash, 'REFUNDED');
      }
    },

    async markAuctioning(p: AuctionOpenedPayload) {
      const existing = intents.get(lower(p.intentHash));
      if (!existing || existing.state !== 'PENDING') return;
      updateState(p.intentHash, 'AUCTIONING', {auctionDeadline: p.auctionDeadline});
    },

    async upsertProposal(p: ProposalEventPayload) {
      const exists = proposals.some(
        (q) => q.intentHash === lower(p.intentHash) && q.solver === lower(p.solver)
      );
      if (exists) return;
      proposals.push({
        intentHash: lower(p.intentHash),
        solver: lower(p.solver),
        proposedOutputAmount: p.proposedOutputAmount,
        solverFeeBps: p.solverFeeBps,
        signature: p.signature,
        proposalDigest: p.proposalDigest,
        winnerAnnounced: false,
      });
    },

    async markProposalWinner(p: WinnerSelectedPayload) {
      const proposal = proposals.find(
        (q) => q.intentHash === lower(p.intentHash) && q.solver === lower(p.solver)
      );
      if (proposal) proposal.winnerAnnounced = true;
    },

    async readCursor(chainId, contractAddress) {
      return cursors.get(cursorKey(chainId, contractAddress)) ?? null;
    },

    async advanceCursor(advance: CursorAdvance) {
      cursors.set(cursorKey(advance.chainId, advance.contractAddress), advance.lastProcessedBlock);
    },

    async withTransaction(fn) {
      // No real transactions in memory; just invoke the function.
      return fn(undefined as never);
    },

    async listMatchEligible(sourceChainId, nowSec) {
      return [...intents.values()].filter(
        (i) =>
          i.sourceChainId === sourceChainId &&
          (i.state === 'PENDING' || i.state === 'AUCTIONING') &&
          i.deadline > nowSec
      );
    },

    async getIntent(intentHash) {
      return intents.get(lower(intentHash)) ?? null;
    },

    async listEligibleForAuctionOpen(sourceChainId, nowSec, auctionDelaySec) {
      return [...intents.values()].filter(
        (i) =>
          i.sourceChainId === sourceChainId &&
          i.state === 'PENDING' &&
          i.submittedAtBlockTs !== undefined &&
          i.submittedAtBlockTs + auctionDelaySec < nowSec &&
          i.deadline > nowSec
      );
    },

    async listEligibleForAuctionFinalize(sourceChainId, nowSec) {
      return [...intents.values()].filter(
        (i) =>
          i.sourceChainId === sourceChainId &&
          i.state === 'AUCTIONING' &&
          i.auctionDeadline !== undefined &&
          i.auctionDeadline < nowSec
      );
    },

    async listIntentsByUser(userAddr, limit, offset) {
      const filtered = [...intents.values()]
        .filter((i) => i.user.toLowerCase() === userAddr.toLowerCase())
        .sort((a, b) => (b.submittedAtBlockTs ?? 0) - (a.submittedAtBlockTs ?? 0));
      return filtered.slice(offset, offset + limit);
    },
  };
}
