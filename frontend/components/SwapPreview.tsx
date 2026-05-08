'use client';

import {ArrowDown, ChevronDown} from 'lucide-react';
import {motion} from 'framer-motion';
import {ChainIcon} from '@/components/icons/ChainIcon';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';

/**
 * Static hero-right preview of the real swap card. Mirrors the live
 * /swap composition: each side has the cyan label, big mono amount,
 * and the across-style combined token+chain chip with the chain badge
 * overlapping the token icon.
 *
 * Non-interactive — the wallet picker, on-chain writes, validation
 * states, and picker dialog all live on /swap. The hero just shows the
 * shape of the product.
 */
export function SwapPreview() {
  return (
    <motion.div
      initial={{opacity: 0, y: 16}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.7, delay: 0.2, ease: 'easeOut'}}
      className="relative mx-auto w-full max-w-md lg:rotate-[1.5deg]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[40%] bg-[radial-gradient(ellipse_55%_55%_at_60%_50%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent_70%)] blur-2xl"
      />

      {/* Floating chain accent in the bottom-right corner — matches the
          live page's halo pattern, gives the preview a tilt anchor. */}
      <div className="pointer-events-none absolute -right-5 -bottom-6 hidden lg:block">
        <div className="rounded-full bg-card/80 p-1.5 ring-1 ring-foreground/10 backdrop-blur-md">
          <ChainIcon chainId={8453} size={32} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-card/70 p-5 shadow-2xl shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur-2xl">
        <div className="text-lg font-semibold tracking-tight text-foreground">Swap</div>

        <div className="mt-4 space-y-2">
          <Side
            label="From"
            chainId={1}
            tokenSymbol="USDC"
            amount="1,000.00"
          />
          <FlipDivider />
          <Side
            label="To"
            chainId={8453}
            tokenSymbol="ETH"
            amount="0.342"
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-background/40 px-4 py-2.5 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Min price
          </span>
          <span className="font-mono tabular-nums text-foreground">
            2,924.85 USDC / ETH
          </span>
        </div>

        <div className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_8px_28px_-8px_color-mix(in_oklch,var(--color-primary)_45%,transparent)]">
          Submit intent
        </div>
      </div>
    </motion.div>
  );
}

function Side({
  label,
  chainId,
  tokenSymbol,
  amount,
}: {
  label: string;
  chainId: number;
  tokenSymbol: 'ETH' | 'USDC' | 'USDT';
  amount: string;
}) {
  return (
    <div className="rounded-2xl bg-background/40 p-4 ring-1 ring-foreground/5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 truncate font-mono text-3xl font-medium tabular-nums tracking-tight text-foreground">
          {amount}
        </div>
        <PreviewChip chainId={chainId} symbol={tokenSymbol} />
      </div>
    </div>
  );
}

function PreviewChip({
  chainId,
  symbol,
}: {
  chainId: number;
  symbol: 'ETH' | 'USDC' | 'USDT';
}) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-2xl bg-card/90 py-1.5 pr-2.5 pl-1.5 ring-1 ring-foreground/10">
      <TokenWithChainOverlay symbol={symbol} chainId={chainId} size={30} />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">{symbol}</span>
        <span className="text-[11px] text-muted-foreground">
          {chainId === 1 ? 'Ethereum' : chainId === 8453 ? 'Base' : 'Chain'}
        </span>
      </span>
      <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function FlipDivider() {
  return (
    <div className="relative flex items-center justify-center">
      <span className="my-1 flex size-9 items-center justify-center rounded-xl bg-card text-foreground ring-1 ring-foreground/15 backdrop-blur-md">
        <ArrowDown className="size-4" aria-hidden="true" />
      </span>
    </div>
  );
}
