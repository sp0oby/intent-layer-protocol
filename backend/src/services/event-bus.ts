/**
 * In-process event bus keyed by intent hash. WebSocket clients subscribe
 * per-hash; the indexer publishes after each successful DB mutation via
 * the publishing-repository decorator.
 *
 * For multi-process scale-out, swap this for Postgres LISTEN/NOTIFY or
 * Redis pub/sub. The bus interface is intentionally narrow so that swap
 * only touches the construction site.
 */

import type {IntentState} from '../types/intent.js';

export type IntentEvent =
  | {type: 'IntentSubmitted'; intentHash: string; submitTxHash: string}
  | {type: 'StateChange'; intentHash: string; newState: IntentState; txHash?: string}
  | {type: 'ProposalSubmitted'; intentHash: string; solver: string; proposedOutputAmount: string}
  | {type: 'WinnerSelected'; intentHash: string; solver: string};

type Listener = (event: IntentEvent) => void;

export interface IntentEventBus {
  /** Subscribe to events for one hash. Returns an `unsubscribe` callback. */
  on(intentHash: string, listener: Listener): () => void;
  emit(event: IntentEvent): void;
  /** Number of active listeners (test / metrics introspection). */
  listenerCount(intentHash: string): number;
}

export function createEventBus(): IntentEventBus {
  const listeners = new Map<string, Set<Listener>>();
  const lower = (h: string): string => h.toLowerCase();

  return {
    on(intentHash, listener) {
      const key = lower(intentHash);
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        const live = listeners.get(key);
        if (!live) return;
        live.delete(listener);
        if (live.size === 0) listeners.delete(key);
      };
    },

    emit(event) {
      const set = listeners.get(lower(event.intentHash));
      if (!set) return;
      for (const listener of set) {
        try {
          listener(event);
        } catch {
          // Listeners must not break each other. WebSocket send failures
          // (closed sockets, backpressure) are swallowed here; the ws
          // layer is responsible for its own cleanup on error.
        }
      }
    },

    listenerCount(intentHash) {
      return listeners.get(lower(intentHash))?.size ?? 0;
    },
  };
}
