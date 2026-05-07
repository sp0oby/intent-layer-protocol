'use client';

import type {ReactNode} from 'react';
import {useIntent} from '@/hooks/useIntents';
import {useIntentStatus} from '@/hooks/useIntentStatus';

/**
 * Status display for a single intent. Combines a polled REST query (the
 * canonical snapshot) with a WebSocket subscription (live state changes).
 *
 * Wireframe phase: pure b&w; the proper animated state-machine timeline
 * lands in Stage 5.3.
 */
export function IntentStatusClient({id}: {id: string}) {
  const isHash = id.startsWith('0x') && id.length === 66;
  const {data: intent, isLoading, error} = useIntent(isHash ? id : undefined);
  const {status: wsStatus, lastEvent} = useIntentStatus({
    intentHash: isHash ? id : undefined,
  });

  return (
    <div className="mt-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intent status</h1>
      <p className="font-mono text-xs text-muted-foreground">{id}</p>

      {!isHash && (
        <p className="text-sm text-muted-foreground">
          Provide a 32-byte intent hash (0x… 64 hex chars). The Stage 5
          submission flow will route here automatically after a real
          submitIntent call.
        </p>
      )}

      {isLoading && isHash && <p className="text-sm">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {intent && (
        <dl className="grid gap-3 text-sm">
          <Row label="State" value={<span className="font-medium">{intent.state}</span>} />
          <Row label="Route" value={`${intent.sourceChainId} → ${intent.destChainId}`} />
          <Row label="User" value={<span className="font-mono text-xs">{intent.user}</span>} />
          <Row
            label="Source"
            value={
              <span className="font-mono text-xs">
                {intent.sourceAmount} of {intent.sourceToken}
              </span>
            }
          />
          <Row
            label="Min received"
            value={
              <span className="font-mono text-xs">
                {intent.minDestAmount} of {intent.destToken}
              </span>
            }
          />
        </dl>
      )}

      <div className="border-t pt-4 text-xs text-muted-foreground">
        Live: <span className="font-mono">{wsStatus}</span>
        {lastEvent ? (
          <>
            {' '}
            · last event <span className="font-mono">{lastEvent.type}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Row({label, value}: {label: string; value: ReactNode}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
