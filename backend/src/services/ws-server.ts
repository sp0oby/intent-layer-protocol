/**
 * WebSocket server. Subscribes per-connection to the IntentEventBus by
 * `?intentHash=` query param and broadcasts JSON-encoded events.
 *
 * Wire-format: each message is `JSON.stringify(IntentEvent)`. Schema is
 * stable across the WS and indexer publish paths so the frontend can
 * deserialize once.
 *
 * Connection lifecycle:
 *   - Connect with `ws://host/ws?intentHash=0x…` — invalid hash → 1008.
 *   - Subscribe registers a listener for the lowercased hash.
 *   - Server -> client send failures during a broadcast trigger a graceful
 *     close (the unsubscribe in 'close' handler clears the listener).
 *   - Server emits `{type: "Subscribed", intentHash}` once on connect so
 *     the client knows when it is safe to start expecting state updates.
 */

import type {Server as HttpServer} from 'node:http';
import {WebSocketServer, type WebSocket} from 'ws';
import type {IntentEventBus} from './event-bus.js';

export interface WsConfig {
  /** HTTP path to attach to. Defaults to `/ws`. */
  path?: string;
}

export interface WsServerHandle {
  close: () => Promise<void>;
}

const isHashValid = (h: string): boolean => /^0x[0-9a-fA-F]{64}$/.test(h);

export function attachWsServer(httpServer: HttpServer, bus: IntentEventBus, config: WsConfig = {}): WsServerHandle {
  const wss = new WebSocketServer({server: httpServer, path: config.path ?? '/ws'});

  wss.on('connection', (socket: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const intentHash = url.searchParams.get('intentHash');
    if (intentHash === null || !isHashValid(intentHash)) {
      socket.close(1008, 'missing or invalid intentHash');
      return;
    }

    const send = (payload: unknown): void => {
      try {
        socket.send(JSON.stringify(payload));
      } catch {
        // Backpressure / closed socket. Let the close handler clean up.
        try {
          socket.close();
        } catch {
          /* noop */
        }
      }
    };

    const unsubscribe = bus.on(intentHash, (event) => send(event));
    socket.once('close', () => unsubscribe());
    socket.once('error', () => {
      unsubscribe();
      try {
        socket.close();
      } catch {
        /* noop */
      }
    });

    send({type: 'Subscribed', intentHash});
  });

  return {
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
