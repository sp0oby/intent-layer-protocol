/**
 * Live intent status via the backend's WebSocket. Owns one connection per
 * hash for the duration of the component's mount; cleans up on unmount or
 * hash change. Pushes every event into a callback the consumer supplies,
 * and returns the latest event so simple status views can render directly.
 *
 * Pairs with useQuery `useIntent(hash)` — the query gives the canonical
 * snapshot, the WebSocket gives the next state change without a poll.
 */

import {useEffect, useRef, useState} from 'react';
import {api} from '@/lib/api';
import type {IntentEvent} from '@/lib/types';

export interface UseIntentStatusOptions {
  intentHash: string | undefined;
  /** Called for every event the server sends (Subscribed + StateChange + ...). */
  onEvent?: (event: IntentEvent) => void;
  /** Optional reconnect: if the socket closes unexpectedly, reopen after this many ms. */
  reconnectDelayMs?: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface UseIntentStatusResult {
  status: ConnectionStatus;
  lastEvent: IntentEvent | null;
}

const isValid = (h: string | undefined): h is string =>
  typeof h === 'string' && h.startsWith('0x') && h.length === 66;

export function useIntentStatus(opts: UseIntentStatusOptions): UseIntentStatusResult {
  const {intentHash, onEvent, reconnectDelayMs = 2_000} = opts;
  // Derived: when hash is invalid the visible status is always 'idle'.
  // The connection lifecycle state only progresses while a valid hash
  // is being subscribed to — this avoids the React 19 set-state-in-effect
  // warning by not driving "go to idle" through setState.
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [lastEvent, setLastEvent] = useState<IntentEvent | null>(null);
  // Keep the latest onEvent in a ref so the WebSocket message handler
  // always calls the most recently-supplied callback without forcing
  // the connection to tear down on every parent re-render. React 19's
  // `react-hooks/refs` rule requires ref mutation in an effect, not
  // during render.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!isValid(intentHash)) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (cancelled) return;
      setConnectionStatus('connecting');
      socket = new WebSocket(api.intentEventsUrl(intentHash));
      socket.addEventListener('open', () => {
        if (cancelled) return;
        setConnectionStatus('open');
      });
      socket.addEventListener('message', (msg) => {
        if (cancelled) return;
        try {
          const event = JSON.parse(msg.data as string) as IntentEvent;
          setLastEvent(event);
          onEventRef.current?.(event);
        } catch {
          // Malformed payload — drop silently. The server controls the format.
        }
      });
      socket.addEventListener('close', () => {
        if (cancelled) return;
        setConnectionStatus('closed');
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      });
      socket.addEventListener('error', () => {
        if (cancelled) return;
        // Browser will fire `close` next; let the close handler reconnect.
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [intentHash, reconnectDelayMs]);

  const status: ConnectionStatus = isValid(intentHash) ? connectionStatus : 'idle';
  return {status, lastEvent};
}
