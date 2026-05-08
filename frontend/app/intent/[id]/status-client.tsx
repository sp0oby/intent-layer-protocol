'use client';

import {useQueryClient} from '@tanstack/react-query';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';
import {IntentStatusTimeline, AuctionCountdown} from '@/components/IntentStatusTimeline';
import {IntentActions} from '@/components/IntentActions';
import {useIntent} from '@/hooks/useIntents';
import {useIntentStatus} from '@/hooks/useIntentStatus';
import {chainShortName} from '@/lib/chains';
import {formatTokenAmount, truncateAddress} from '@/lib/format';
import type {IntentRecord} from '@/lib/types';

/**
 * Status display for a single intent. Combines:
 *   - REST snapshot from useIntent (canonical state, polled)
 *   - WebSocket subscription from useIntentStatus (live state changes)
 *   - shadcn Card + b&w wireframe styling (no accent colour)
 *
 * When the WebSocket pushes a StateChange we invalidate the
 * useIntent query so the UI re-fetches the canonical row — the WS
 * event itself doesn't carry the full record, just the new state.
 */
export function IntentStatusClient({id}: {id: string}) {
  const isHash = id.startsWith('0x') && id.length === 66;
  const queryClient = useQueryClient();

  const {data: intent, isLoading, error} = useIntent(isHash ? id : undefined);
  const {status: wsStatus} = useIntentStatus({
    intentHash: isHash ? id : undefined,
    onEvent: (event) => {
      if (event.type === 'StateChange' || event.type === 'IntentSubmitted') {
        queryClient.invalidateQueries({queryKey: ['intent', id]});
      }
    },
  });

  if (!isHash) {
    return (
      <div className="mt-8">
        <p className="text-sm text-muted-foreground">
          Provide a 32-byte intent hash (0x… 64 hex chars). The Stage 5
          submission flow routes here automatically after a real
          submitIntent call.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8">
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="mt-8">
        <p className="text-sm text-muted-foreground">
          No intent with that hash yet — it may take a moment for the indexer to
          observe a freshly-submitted IntentSubmitted event.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle className="text-2xl">Intent</CardTitle>
            <span className="font-mono text-xs text-muted-foreground">
              {intent.intentHash.slice(0, 10)}…{intent.intentHash.slice(-8)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <IntentStatusTimeline state={intent.state} />
          {intent.state === 'AUCTIONING' && intent.auctionDeadline ? (
            <AuctionCountdown deadline={intent.auctionDeadline} />
          ) : null}
          <IntentActions intent={intent} />
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid intent={intent} />
        </CardContent>
      </Card>

      <p className="text-right text-xs text-muted-foreground">
        Live updates: <span className="font-mono">{wsStatus}</span>
      </p>
    </div>
  );
}

function DetailGrid({intent}: {intent: IntentRecord}) {
  const sourceLabel = formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId);
  const destLabel = formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId);
  return (
    <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <Row label="From" value={`${sourceLabel} on ${chainShortName(intent.sourceChainId)}`} />
      <Row label="To (min)" value={`${destLabel} on ${chainShortName(intent.destChainId)}`} />
      <Row label="User" value={truncateAddress(intent.user)} mono />
      <Row label="Refund to" value={truncateAddress(intent.refundTo)} mono />
      <Row label="Deadline" value={new Date(intent.deadline * 1000).toLocaleString()} />
      <Row label="Nonce" value={intent.nonce} mono />
    </dl>
  );
}

function Row({label, value, mono}: {label: string; value: string; mono?: boolean}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={mono ? 'mt-1 font-mono text-xs' : 'mt-1'}>{value}</dd>
    </div>
  );
}

