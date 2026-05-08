'use client';

import {Layers, ShieldCheck, Timer} from 'lucide-react';
import {motion} from 'framer-motion';
import {ChainIcon} from '@/components/icons/ChainIcon';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';
import {chainShortName, isSupportedChain} from '@/lib/chains';
import type {TokenSymbol} from '@/lib/tokens';
import type {IntentState} from '@/lib/types';

export type RouteStepKey = 'match' | 'settlement' | 'refund';

/**
 * Cross-chain intent route preview. Top: centred chain-to-chain flow
 * (`Eth → Base` with identity icons). Below: three labelled steps —
 * Match · Settlement · Refund — connected by a hairline timeline. The
 * step driven by `activeStep` glows cyan and pulses; everything else
 * stays in resting state. When `activeStep` is undefined nothing
 * pulses (used as a static reference on screens with no live intent).
 *
 * The status page derives activeStep from the intent's on-chain state
 * via stateToActiveStep().
 */
export function RoutePreview({
  sourceChainId,
  destChainId,
  sourceSymbol,
  destSymbol,
  activeStep,
}: {
  sourceChainId: number | undefined;
  destChainId: number | undefined;
  sourceSymbol?: TokenSymbol | undefined;
  destSymbol?: TokenSymbol | undefined;
  activeStep: RouteStepKey | undefined;
}) {
  const sourceName =
    sourceChainId && isSupportedChain(sourceChainId) ? chainShortName(sourceChainId) : '—';
  const destName =
    destChainId && isSupportedChain(destChainId) ? chainShortName(destChainId) : '—';

  return (
    <section className="overflow-hidden rounded-2xl bg-background/40 ring-1 ring-foreground/5">
      <header className="flex flex-col items-center gap-2 border-b border-foreground/5 px-5 py-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Route
        </span>
        <div className="flex items-center gap-3">
          <RouteEnd chainId={sourceChainId} chainName={sourceName} symbol={sourceSymbol} />
          <ArrowRightSmall />
          <RouteEnd chainId={destChainId} chainName={destName} symbol={destSymbol} />
        </div>
      </header>

      <div className="relative grid grid-cols-3 px-5 py-5">
        <div className="pointer-events-none absolute top-[1.625rem] right-[16.7%] left-[16.7%] h-px bg-foreground/10" />

        <RouteStep label="Match" icon={<Timer className="size-4" />} active={activeStep === 'match'} />
        <RouteStep label="Settlement" icon={<Layers className="size-4" />} active={activeStep === 'settlement'} />
        <RouteStep label="Refund" icon={<ShieldCheck className="size-4" />} active={activeStep === 'refund'} />
      </div>
    </section>
  );
}

/**
 * One end of the chain-to-chain flow header. When a token symbol is
 * provided we render the chain-overlay icon + "SYMBOL · Chain"; with
 * no symbol (e.g. on a static reference) we fall back to just the
 * chain icon and name.
 */
function RouteEnd({
  chainId,
  chainName,
  symbol,
}: {
  chainId: number | undefined;
  chainName: string;
  symbol: TokenSymbol | undefined;
}) {
  if (chainId && symbol) {
    return (
      <div className="flex items-center gap-2">
        <TokenWithChainOverlay chainId={chainId} symbol={symbol} size={26} />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">{symbol}</span>
          <span className="text-[11px] text-muted-foreground">{chainName}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {chainId ? (
        <ChainIcon chainId={chainId} size={20} />
      ) : (
        <span className="size-5 rounded-full bg-muted-foreground/30" />
      )}
      <span className="text-sm font-medium text-foreground">{chainName}</span>
    </div>
  );
}

function RouteStep({
  label,
  icon,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      {active ? (
        <motion.span
          className="relative z-10 flex size-9 items-center justify-center rounded-full bg-card text-primary ring-1 ring-primary/40"
          animate={{
            boxShadow: [
              '0 0 0 0 color-mix(in oklch, var(--color-primary) 0%, transparent)',
              '0 0 18px 3px color-mix(in oklch, var(--color-primary) 45%, transparent)',
              '0 0 0 0 color-mix(in oklch, var(--color-primary) 0%, transparent)',
            ],
          }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {icon}
        </motion.span>
      ) : (
        <span className="relative z-10 flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-foreground/15">
          {icon}
        </span>
      )}
      <span className={'text-xs font-medium ' + (active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
    </div>
  );
}

function ArrowRightSmall() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Map the protocol's on-chain IntentState to which route step is lit.
 *   PENDING / AUCTIONING        → 'match'
 *   MATCHED / LOCKED / SETTLED  → 'settlement'
 *   REFUNDED / CANCELLED        → 'refund'
 *
 * Pre-submission consumers pass undefined for a static (unlit) preview.
 */
export function stateToActiveStep(state: IntentState | undefined): RouteStepKey | undefined {
  if (!state) return undefined;
  switch (state) {
    case 'PENDING':
    case 'AUCTIONING':
      return 'match';
    case 'MATCHED':
    case 'LOCKED':
    case 'SETTLED':
      return 'settlement';
    case 'REFUNDED':
    case 'CANCELLED':
      return 'refund';
  }
}
