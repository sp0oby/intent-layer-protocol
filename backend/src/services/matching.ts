/**
 * Off-chain mirror of the on-chain IntentSettler state machine and Intent
 * struct (contracts/src/interfaces/IIntentSettler.sol). The matcher is an
 * efficiency optimisation, not a security boundary — the destination chain
 * independently re-validates token, chain, and both-sides minimums against
 * authoritative payload data carried over LayerZero. A buggy matcher cannot
 * cause a settlement that violates either user's signed `minDestAmount` or
 * `destToken` (see docs/ARCHITECTURE.md trust-boundary note and
 * docs/STAGE_3_FINAL_REVIEW.md § R-16).
 */

/** Mirrors IIntentSettler.IntentState. NONE is omitted because a record only
 *  exists once IntentSubmitted has been emitted. LOCKED is reserved for
 *  Phase 2B async-settlement designs and never observed in Phase 1. */
export type IntentState =
  | 'PENDING'
  | 'MATCHED'
  | 'AUCTIONING'
  | 'LOCKED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REFUNDED';

/** States a P2P matcher should consider eligible counterparties.
 *  Per ARCHITECTURE.md state machine, an Auctioning intent can still settle
 *  via P2P if a counterparty arrives before the auction window closes. */
const MATCH_ELIGIBLE: ReadonlySet<IntentState> = new Set<IntentState>(['PENDING', 'AUCTIONING']);

/** One-to-one with the contract `Intent` struct + indexer bookkeeping fields
 *  populated from event payloads. All numeric on-chain values are stored as
 *  decimal strings to avoid Number precision loss on uint256 amounts.
 *
 *  Per-state tx hashes are stamped by the indexer as each on-chain event
 *  arrives. They power the "view on explorer" chips on the status page —
 *  without them the user has no way to verify what actually settled.
 *  Hashes are optional because the corresponding event may not have
 *  fired yet. */
export interface IntentRecord {
  intentHash: string;
  user: string;
  refundTo: string;
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: string;
  destChainId: number;
  destToken: string;
  minDestAmount: string;
  deadline: number;
  nonce: string;
  state: IntentState;
  submittedAtBlockTs?: number;
  matchTimestamp?: number;
  auctionDeadline?: number;
  /** Tx that emitted IntentSubmitted on the source chain. */
  submitTxHash?: string;
  /** Tx that emitted IntentMatched on the source chain (the executeMatching call). */
  matchTxHash?: string;
  /** Tx that emitted IntentSettled on the destination chain. */
  settleTxHash?: string;
  /** Tx that emitted IntentCancelled on the source chain. */
  cancelTxHash?: string;
  /** Tx that emitted IntentRefunded on the source chain (LZ timeout path). */
  refundTxHash?: string;
}

const lower = (addr: string): string => addr.toLowerCase();

const isExpired = (intent: IntentRecord, nowSec: number): boolean => intent.deadline <= nowSec;

/**
 * Find the first opposite intent that satisfies both users' minimums.
 *
 * Match criteria (must hold for both sides):
 *   - opposite chain pair (other.source = this.dest, other.dest = this.source)
 *   - opposite token pair (other.sourceToken = this.destToken, etc.)
 *   - other.sourceAmount >= this.minDestAmount  (this user's floor)
 *   - this.sourceAmount  >= other.minDestAmount (other user's floor)
 *   - neither side past its `deadline`
 *   - both sides in a match-eligible state (Pending or Auctioning)
 */
export function findOppositeIntent(
  target: IntentRecord,
  book: IntentRecord[],
  nowSec: number = Math.floor(Date.now() / 1000)
): IntentRecord | undefined {
  if (!MATCH_ELIGIBLE.has(target.state)) return undefined;
  if (isExpired(target, nowSec)) return undefined;

  const targetSource = lower(target.sourceToken);
  const targetDest = lower(target.destToken);
  const targetSourceAmount = BigInt(target.sourceAmount);
  const targetMinDestAmount = BigInt(target.minDestAmount);

  for (const candidate of book) {
    if (candidate.intentHash === target.intentHash) continue;
    if (!MATCH_ELIGIBLE.has(candidate.state)) continue;
    if (isExpired(candidate, nowSec)) continue;
    if (candidate.sourceChainId !== target.destChainId) continue;
    if (candidate.destChainId !== target.sourceChainId) continue;
    if (lower(candidate.sourceToken) !== targetDest) continue;
    if (lower(candidate.destToken) !== targetSource) continue;

    const candidateSourceAmount = BigInt(candidate.sourceAmount);
    const candidateMinDestAmount = BigInt(candidate.minDestAmount);
    if (targetSourceAmount < candidateMinDestAmount) continue;
    if (candidateSourceAmount < targetMinDestAmount) continue;

    return candidate;
  }
  return undefined;
}

/** In-memory order book. Replaced by a Postgres-backed implementation in the
 *  next Stage-4 task (W4-02 / matching engine wired to Postgres). The shape
 *  is preserved so the upgrade is a drop-in replacement. */
export class InMemoryOrderBook {
  private readonly intents = new Map<string, IntentRecord>();

  upsert(intent: IntentRecord): void {
    this.intents.set(intent.intentHash, intent);
  }

  get(intentHash: string): IntentRecord | undefined {
    return this.intents.get(intentHash);
  }

  /** Match-eligible intents (Pending or Auctioning, not expired). */
  listUnmatched(nowSec: number = Math.floor(Date.now() / 1000)): IntentRecord[] {
    return [...this.intents.values()].filter(
      (intent) => MATCH_ELIGIBLE.has(intent.state) && !isExpired(intent, nowSec)
    );
  }
}
