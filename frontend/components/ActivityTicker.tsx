'use client';

import Link from 'next/link';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';
import {useUnmatchedIntents} from '@/hooks/useIntents';
import {chainShortName, isSupportedChain} from '@/lib/chains';
import {formatTokenAmount} from '@/lib/format';
import {findToken, type TokenSymbol} from '@/lib/tokens';
import type {IntentRecord} from '@/lib/types';

/**
 * Live recent-activity rail. Subscribes to the unmatched-intents query
 * (5s refetch) and renders up to six rows. Each row is composed —
 * chain-overlay icons for both sides + 'SYMBOL · Chain' label + the
 * properly-formatted amount pair — so a solver scanning the list
 * understands at-a-glance what asset pair is on offer. The previous
 * raw-wei truncation made small amounts (0.2 ETH = 200…000 wei) read
 * as "2000", which was misleading.
 *
 * Empty / error states are honest rather than spinning forever — the
 * indexer is the source of truth and "unreachable" copy points the
 * user at the local-stack command.
 */
export function ActivityTicker() {
  const {data, isError, isLoading} = useUnmatchedIntents();
  const rows = (data ?? []).slice(0, 6);

  return (
    <section className="rounded-2xl bg-card/40 ring-1 ring-foreground/10 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={
              'size-1.5 rounded-full ' +
              (rows.length > 0
                ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]'
                : 'bg-muted-foreground/40')
            }
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Live activity
          </span>
        </div>
        <Link
          href="/history"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          message={
            isLoading
              ? 'Connecting to indexer…'
              : isError
                ? 'Indexer unreachable. Run npm run local-stack in /backend.'
                : 'Awaiting first match.'
          }
        />
      ) : (
        <ul className="divide-y divide-foreground/5">
          {rows.map((intent) => (
            <Row key={intent.intentHash} intent={intent} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({intent}: {intent: IntentRecord}) {
  const sourceSymbol = inferSymbol(intent.sourceToken, intent.sourceChainId);
  const destSymbol = inferSymbol(intent.destToken, intent.destChainId);
  const sourceLabel = formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId);
  const destLabel = formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId);

  const sourceChainName = isSupportedChain(intent.sourceChainId)
    ? chainShortName(intent.sourceChainId)
    : `Chain ${intent.sourceChainId}`;
  const destChainName = isSupportedChain(intent.destChainId)
    ? chainShortName(intent.destChainId)
    : `Chain ${intent.destChainId}`;

  return (
    <li>
      <Link
        href={`/intent/${intent.intentHash}`}
        className="grid grid-cols-12 items-center gap-3 px-6 py-3.5 transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="col-span-7 flex items-center gap-2 sm:col-span-5">
          <TokenChainPill chainId={intent.sourceChainId} chainName={sourceChainName} symbol={sourceSymbol} />
          <Arrow />
          <TokenChainPill chainId={intent.destChainId} chainName={destChainName} symbol={destSymbol} />
        </div>
        <div className="col-span-5 hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:col-span-5 sm:block">
          {sourceLabel} <span className="text-muted-foreground/60">→</span> {destLabel}
        </div>
        <div className="col-span-5 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85 sm:col-span-2">
          {intent.state}
        </div>
      </Link>
    </li>
  );
}

function TokenChainPill({
  chainId,
  chainName,
  symbol,
}: {
  chainId: number;
  chainName: string;
  symbol: TokenSymbol | undefined;
}) {
  if (symbol) {
    return (
      <div className="flex items-center gap-1.5">
        <TokenWithChainOverlay chainId={chainId} symbol={symbol} size={22} />
        <span className="flex items-baseline gap-1 leading-none">
          <span className="text-xs font-semibold text-foreground">{symbol}</span>
          <span className="text-[10px] text-muted-foreground">{chainName}</span>
        </span>
      </div>
    );
  }
  return (
    <span className="text-xs font-medium text-foreground">{chainName}</span>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyState({message}: {message: string}) {
  return (
    <div className="flex items-center justify-center px-6 py-14 text-xs text-muted-foreground">
      {message}
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
