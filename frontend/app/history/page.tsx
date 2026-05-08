'use client';

import Link from 'next/link';
import {useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {useConnection} from 'wagmi';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';
import {useIntentHistory} from '@/hooks/useIntents';
import {useNowSeconds} from '@/hooks/useNow';
import {chainShortName} from '@/lib/chains';
import {formatTokenAmount, relativeTime} from '@/lib/format';
import {findToken, type TokenSymbol} from '@/lib/tokens';
import type {IntentRecord, IntentState} from '@/lib/types';

const PAGE_SIZE = 20;

/**
 * Per-user intent history. Glass card with the wallet-gated states:
 * connect prompt → loading skeletons → empty CTA → real rows. Each
 * row is composed (not tabular) — chain-overlay token icons on each
 * side, mono amounts, state pill, relative timestamp. Clicking a row
 * navigates to the status page for that intent.
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
    <section className="relative mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-16 -z-10 rounded-[40%] bg-[radial-gradient(ellipse_55%_50%_at_50%_50%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_70%)] blur-2xl"
      />

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          History
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every intent submitted from the connected wallet, newest first.
        </p>
      </header>

      <div className="overflow-hidden rounded-3xl bg-card/70 shadow-2xl shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur-2xl">
        {!isConnected ? (
          <ConnectPrompt />
        ) : isLoading ? (
          <LoadingRows />
        ) : error ? (
          <Notice tone="error">{(error as Error).message}</Notice>
        ) : !data || data.intents.length === 0 ? (
          page === 0 ? (
            <EmptyState />
          ) : (
            <Notice tone="muted">No more intents on this page.</Notice>
          )
        ) : (
          <HistoryRows intents={data.intents} />
        )}

        {data && (data.hasMore || page > 0) ? (
          <Pagination
            page={page}
            hasMore={data.hasMore}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </div>
    </section>
  );
}

function HistoryRows({intents}: {intents: IntentRecord[]}) {
  const nowSec = useNowSeconds(60_000);
  return (
    <ul className="divide-y divide-foreground/5">
      {intents.map((intent) => (
        <HistoryRow key={intent.intentHash} intent={intent} nowSec={nowSec} />
      ))}
    </ul>
  );
}

function HistoryRow({intent, nowSec}: {intent: IntentRecord; nowSec: number}) {
  const sourceSymbol = inferSymbol(intent.sourceToken, intent.sourceChainId);
  const destSymbol = inferSymbol(intent.destToken, intent.destChainId);
  const sourceLabel = formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId);
  const destLabel = formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId);
  const submittedAt = intent.submittedAtBlockTs;

  const [sourceAmount, sourceUnit] = splitAmountLabel(sourceLabel);
  const [destAmount, destUnit] = splitAmountLabel(destLabel);

  return (
    <li>
      <Link
        href={`/intent/${intent.intentHash}`}
        className="grid grid-cols-12 items-center gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.02] sm:px-6 sm:py-5"
      >
        <div className="col-span-12 flex items-center gap-3 sm:col-span-5">
          {sourceSymbol ? (
            <TokenWithChainOverlay
              symbol={sourceSymbol}
              chainId={intent.sourceChainId}
              size={32}
            />
          ) : (
            <span className="size-8 rounded-full bg-muted-foreground/30" />
          )}
          <ArrowRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
          {destSymbol ? (
            <TokenWithChainOverlay symbol={destSymbol} chainId={intent.destChainId} size={32} />
          ) : (
            <span className="size-8 rounded-full bg-muted-foreground/30" />
          )}
          <div className="ml-1 hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold text-foreground">
              {sourceSymbol ? `${sourceSymbol} · ` : ''}
              {chainShortName(intent.sourceChainId)}
              <span className="text-muted-foreground"> → </span>
              {destSymbol ? `${destSymbol} · ` : ''}
              {chainShortName(intent.destChainId)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {intent.intentHash.slice(0, 6)}…{intent.intentHash.slice(-4)}
            </span>
          </div>
        </div>

        <div className="col-span-7 hidden text-sm sm:col-span-4 sm:block">
          <div className="font-mono tabular-nums text-foreground">
            {sourceAmount} <span className="text-muted-foreground">{sourceUnit}</span>
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            ≥ {destAmount} {destUnit}
          </div>
        </div>

        <div className="col-span-8 sm:col-span-2">
          <StatePill state={intent.state} />
        </div>

        <div className="col-span-4 text-right text-xs text-muted-foreground sm:col-span-1">
          {submittedAt ? relativeTime(nowSec - submittedAt) : '—'}
        </div>
      </Link>
    </li>
  );
}

function StatePill({state}: {state: IntentState}) {
  const tone = stateTone(state);
  const label = stateLabel(state);
  const cls =
    tone === 'active'
      ? 'bg-primary/10 text-primary ring-primary/40'
      : tone === 'success'
        ? 'bg-foreground/[0.06] text-foreground ring-foreground/15'
        : 'bg-foreground/[0.04] text-muted-foreground ring-foreground/10';
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ring-1 ' +
        cls
      }
    >
      {tone === 'active' ? (
        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
      ) : null}
      {label}
    </span>
  );
}

function ConnectPrompt() {
  return (
    <Notice tone="muted">
      Connect a wallet to see the intents you&rsquo;ve submitted.
    </Notice>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-3 px-6 py-10">
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
    <div className="divide-y divide-foreground/5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-6 py-5">
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

function Notice({children, tone}: {children: React.ReactNode; tone: 'muted' | 'error'}) {
  return (
    <p className={'px-6 py-10 text-sm ' + (tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  );
}

function Pagination({
  page,
  hasMore,
  onPrev,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-foreground/5 px-6 py-4 text-sm">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">Page {page + 1}</span>
      <Button variant="outline" size="sm" disabled={!hasMore} onClick={onNext}>
        Load more
      </Button>
    </div>
  );
}

function inferSymbol(addr: string, chainId: number): TokenSymbol | undefined {
  const lower = addr.toLowerCase();
  for (const symbol of ['ETH', 'USDC', 'USDT'] as const) {
    const token = findToken(chainId, symbol);
    if (token && token.address.toLowerCase() === lower) return symbol;
  }
  return undefined;
}

function splitAmountLabel(label: string): [string, string] {
  const idx = label.indexOf(' ');
  if (idx === -1) return [label, ''];
  return [label.slice(0, idx), label.slice(idx + 1)];
}

function stateTone(state: IntentState): 'muted' | 'active' | 'success' {
  if (state === 'PENDING' || state === 'AUCTIONING' || state === 'MATCHED' || state === 'LOCKED') {
    return 'active';
  }
  if (state === 'SETTLED') return 'success';
  return 'muted';
}

function stateLabel(state: IntentState): string {
  switch (state) {
    case 'PENDING':
      return 'Pending';
    case 'AUCTIONING':
      return 'Auction';
    case 'MATCHED':
      return 'Matched';
    case 'LOCKED':
      return 'Settling';
    case 'SETTLED':
      return 'Settled';
    case 'CANCELLED':
      return 'Cancelled';
    case 'REFUNDED':
      return 'Refunded';
  }
}
