'use client';

import Link from 'next/link';
import {useState} from 'react';
import {useConnection} from 'wagmi';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {Badge} from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {useIntentHistory} from '@/hooks/useIntents';
import {useNowSeconds} from '@/hooks/useNow';
import {chainShortName} from '@/lib/chains';
import {findToken} from '@/lib/tokens';
import {formatUnits} from 'viem';
import type {IntentRecord, IntentState} from '@/lib/types';

const PAGE_SIZE = 20;

/**
 * Per-user intent history. Wallet-gated: shows a connect prompt when
 * disconnected, a skeleton table while loading, an empty state when
 * the user has no rows, otherwise a paginated table with one row per
 * intent and a "Load more" button when the API reports hasMore.
 */
export default function HistoryPage() {
  const {address, isConnected} = useConnection();
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;
  const {data, isLoading, error} = useIntentHistory(isConnected ? address : undefined, {
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-2xl">History</CardTitle>
          <CardDescription>
            Every intent you&rsquo;ve submitted, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <ConnectPrompt />
          ) : isLoading ? (
            <LoadingRows />
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.intents.length === 0 ? (
            page === 0 ? (
              <EmptyState />
            ) : (
              <p className="text-sm text-muted-foreground">No more intents on this page.</p>
            )
          ) : (
            <HistoryTable intents={data.intents} />
          )}

          {data && (data.hasMore || page > 0) ? (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ConnectPrompt() {
  return (
    <p className="text-sm text-muted-foreground">
      Connect a wallet to see the intents you&rsquo;ve submitted.
    </p>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-sm text-muted-foreground">
        No intents yet from this wallet.
      </p>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/swap" />}>
        Open swap
      </Button>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function HistoryTable({intents}: {intents: IntentRecord[]}) {
  // 60s tick is plenty for relative-time labels — we don't need to
  // re-render every second on a list view.
  const nowSec = useNowSeconds(60_000);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hash</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>State</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {intents.map((intent) => (
          <Row key={intent.intentHash} intent={intent} nowSec={nowSec} />
        ))}
      </TableBody>
    </Table>
  );
}

function Row({intent, nowSec}: {intent: IntentRecord; nowSec: number}) {
  const sourceLabel = formatTokenAmount(
    intent.sourceAmount,
    intent.sourceToken,
    intent.sourceChainId
  );
  const submittedAt = intent.submittedAtBlockTs;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link
          href={`/intent/${intent.intentHash}`}
          className="underline-offset-2 hover:underline"
        >
          {intent.intentHash.slice(0, 6)}…{intent.intentHash.slice(-4)}
        </Link>
      </TableCell>
      <TableCell className="text-xs">
        {chainShortName(intent.sourceChainId)} → {chainShortName(intent.destChainId)}
      </TableCell>
      <TableCell className="text-xs">{sourceLabel}</TableCell>
      <TableCell>
        <StateBadge state={intent.state} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {submittedAt ? relativeTime(nowSec - submittedAt) : '—'}
      </TableCell>
    </TableRow>
  );
}

function StateBadge({state}: {state: IntentState}) {
  // Wireframe rule: no accent colours. Differentiate states only by
  // the badge variant shadcn ships (default = filled, outline, secondary,
  // destructive). Map terminal-success to default, terminal-failure to
  // destructive, in-flight to outline, transient to secondary.
  const variant: 'default' | 'destructive' | 'outline' | 'secondary' =
    state === 'SETTLED'
      ? 'default'
      : state === 'CANCELLED' || state === 'REFUNDED'
      ? 'destructive'
      : state === 'AUCTIONING'
      ? 'secondary'
      : 'outline';
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wider">
      {state.toLowerCase()}
    </Badge>
  );
}

/** Relative time helper. ago-style for past timestamps; falls back to
 *  "just now" when the diff is below 1 minute. */
function relativeTime(secondsAgo: number): string {
  if (secondsAgo < 60) return 'just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86_400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86_400)}d ago`;
}

/** Format a uint256 amount via the per-chain token registry. Falls back
 *  to the raw string + truncated address for unknown tokens. */
function formatTokenAmount(amountWei: string, tokenAddr: string, chainId: number): string {
  for (const symbol of ['ETH', 'USDC', 'USDT'] as const) {
    const token = findToken(chainId, symbol);
    if (token && token.address.toLowerCase() === tokenAddr.toLowerCase()) {
      return `${formatUnits(BigInt(amountWei), token.decimals)} ${token.symbol}`;
    }
  }
  return `${amountWei} (${tokenAddr.slice(0, 6)}…)`;
}
