/**
 * Canonical TypeScript shapes for on-chain types we read off events.
 *
 * Source of truth: contracts/src/interfaces/IIntentSettler.sol. When the
 * contract Intent struct changes, update this file in lockstep with
 * `IntentRecord` in services/matching.ts.
 *
 * Numeric fields are stored as decimal strings (or `bigint`) to avoid
 * precision loss on uint256 values that exceed Number.MAX_SAFE_INTEGER.
 */

/** Mirrors `IIntentSettler.Intent` — the 10 fields stored on-chain after
 *  IntentSubmitted, exactly as they appear in the EIP-712 typed-data hash.
 *  Indexer event payloads decode directly into this shape.
 *
 *  Numeric fields (sourceAmount, minDestAmount, deadline, nonce) come from
 *  ethers.js as bigint. Persisted as `NUMERIC` (Postgres) or decimal string
 *  (REST/JSON). chainId fields are safe as `number` because they fit in
 *  Number.MAX_SAFE_INTEGER for any realistic chain (current max is ~10**8). */
export interface OnChainIntent {
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: bigint;
  destChainId: number;
  destToken: string;
  minDestAmount: bigint;
  user: string;
  refundTo: string;
  deadline: bigint;
  nonce: bigint;
}

/** Mirrors `IIntentSettler.IntentState`. NONE is omitted because a record
 *  only exists in the off-chain DB once IntentSubmitted has fired. LOCKED
 *  is reserved for Phase 2B async-settlement designs. */
export type IntentState =
  | 'PENDING'
  | 'MATCHED'
  | 'AUCTIONING'
  | 'LOCKED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REFUNDED';

/** Mirrors `IIntentSettler.IntentMeta` packed slot. uint64 timestamps fit
 *  comfortably in `number` (year 2554 max). All optional because the
 *  indexer fills them in as the corresponding events arrive. */
export interface IntentMeta {
  state: IntentState;
  settled?: boolean;
  submittedAt?: number;
  matchTimestamp?: number;
  auctionDeadline?: number;
}

/** Re-export IntentRecord so call sites can import the wire-format type
 *  from a single canonical place (`types/intent`) rather than reaching
 *  into the matcher implementation. */
export type {IntentRecord} from '../services/matching.js';
