/**
 * Canonical TypeScript shapes shared with the backend. Mirrors
 * backend/src/types/intent.ts and the on-chain Intent struct in
 * contracts/src/interfaces/IIntentSettler.sol. When the contract or
 * backend types change, update both files in lockstep.
 */

/** Mirrors `IIntentSettler.IntentState`. NONE is omitted because a row
 *  only exists in the off-chain DB once IntentSubmitted has fired.
 *  LOCKED is reserved for Phase 2B async-settlement designs. */
export type IntentState =
  | 'PENDING'
  | 'MATCHED'
  | 'AUCTIONING'
  | 'LOCKED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REFUNDED';

/** Wire-format intent record returned by `GET /api/intents/*`. Numeric
 *  uint256 values are decimal strings (preserves precision through JSON). */
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
}

/** Mirrors `IIntentSettler.Intent` — what the contract stores on-chain.
 *  Used for typing the wagmi `submitIntent` write call, where uint256
 *  values are bigint. */
export interface OnChainIntent {
  sourceChainId: bigint;
  sourceToken: `0x${string}`;
  sourceAmount: bigint;
  destChainId: bigint;
  destToken: `0x${string}`;
  minDestAmount: bigint;
  user: `0x${string}`;
  refundTo: `0x${string}`;
  deadline: bigint;
  nonce: bigint;
}

/** Real-time event the backend's WebSocket pushes for each intent.
 *  Mirrors `backend/src/services/event-bus.ts` `IntentEvent`. */
export type IntentEvent =
  | {type: 'Subscribed'; intentHash: string}
  | {type: 'IntentSubmitted'; intentHash: string; submitTxHash: string}
  | {type: 'StateChange'; intentHash: string; newState: IntentState; txHash?: string}
  | {type: 'ProposalSubmitted'; intentHash: string; solver: string; proposedOutputAmount: string}
  | {type: 'WinnerSelected'; intentHash: string; solver: string};
