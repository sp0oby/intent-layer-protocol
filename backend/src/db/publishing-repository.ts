/**
 * Decorator that wraps an OrderBookRepository and emits IntentEvents on
 * the bus AFTER each successful underlying mutation. Tests use it with
 * an in-memory bus; production wires the same bus to the WebSocket
 * server in src/index.ts.
 *
 * Emitted only on the success path so a failed DB write does not produce
 * a spurious WebSocket update.
 */

import type {OrderBookRepository} from './repository.js';
import type {IntentEventBus} from '../services/event-bus.js';

export function publishingRepository(inner: OrderBookRepository, bus: IntentEventBus): OrderBookRepository {
  return {
    async insertIntent(payload, client) {
      await inner.insertIntent(payload, client);
      bus.emit({type: 'IntentSubmitted', intentHash: payload.intentHash, submitTxHash: payload.submitTxHash});
      bus.emit({type: 'StateChange', intentHash: payload.intentHash, newState: 'PENDING', txHash: payload.submitTxHash});
    },

    async markMatched(payload, client) {
      await inner.markMatched(payload, client);
      bus.emit({
        type: 'StateChange',
        intentHash: payload.localHash,
        newState: 'MATCHED',
        txHash: payload.executeMatchTxHash,
      });
      bus.emit({
        type: 'StateChange',
        intentHash: payload.remoteHash,
        newState: 'MATCHED',
        txHash: payload.executeMatchTxHash,
      });
    },

    async markCancelled(payload, client) {
      await inner.markCancelled(payload, client);
      bus.emit({
        type: 'StateChange',
        intentHash: payload.intentHash,
        newState: 'CANCELLED',
        txHash: payload.cancelTxHash,
      });
    },

    async markSettled(payload, client) {
      await inner.markSettled(payload, client);
      bus.emit({
        type: 'StateChange',
        intentHash: payload.intentHash,
        newState: 'SETTLED',
        txHash: payload.settleTxHash,
      });
    },

    async markRefunded(payload, client) {
      // The contract emits IntentRefunded from BOTH the LZ-timeout path
      // (state MATCHED -> REFUNDED) and the cancel path (state already
      // moved to CANCELLED via IntentCancelled). Only emit a REFUNDED
      // state change when the transition actually happens — i.e. when
      // the pre-state was MATCHED. Otherwise the WebSocket would briefly
      // show REFUNDED on top of CANCELLED for the same intent.
      const before = await inner.getIntent(payload.intentHash);
      await inner.markRefunded(payload, client);
      if (before?.state === 'MATCHED') {
        bus.emit({
          type: 'StateChange',
          intentHash: payload.intentHash,
          newState: 'REFUNDED',
          txHash: payload.refundTxHash,
        });
      }
    },

    async markAuctioning(payload, client) {
      await inner.markAuctioning(payload, client);
      bus.emit({type: 'StateChange', intentHash: payload.intentHash, newState: 'AUCTIONING'});
    },

    async upsertProposal(payload, client) {
      await inner.upsertProposal(payload, client);
      bus.emit({
        type: 'ProposalSubmitted',
        intentHash: payload.intentHash,
        solver: payload.solver,
        proposedOutputAmount: payload.proposedOutputAmount,
      });
    },

    async markProposalWinner(payload, client) {
      await inner.markProposalWinner(payload, client);
      bus.emit({type: 'WinnerSelected', intentHash: payload.intentHash, solver: payload.solver});
    },

    readCursor: inner.readCursor.bind(inner),
    advanceCursor: inner.advanceCursor.bind(inner),
    withTransaction: inner.withTransaction.bind(inner),
    listMatchEligible: inner.listMatchEligible.bind(inner),
    getIntent: inner.getIntent.bind(inner),
    listEligibleForAuctionOpen: inner.listEligibleForAuctionOpen.bind(inner),
    listEligibleForAuctionFinalize: inner.listEligibleForAuctionFinalize.bind(inner),
  };
}
