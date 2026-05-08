'use client';

import {ChevronDown} from 'lucide-react';
import {chainShortName} from '@/lib/chains';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';
import type {TokenSymbol} from '@/lib/tokens';

/**
 * Combined token + chain chip. One control per side; clicking opens
 * the TokenPickerDialog. Visual: token icon (~36px) with a small chain
 * badge overlapping the bottom-right corner; stacked label (token
 * symbol top, chain name below in muted); chevron on the right.
 *
 * Variant matches the across.to swap card pattern — the user picks a
 * token and a chain in one gesture instead of two.
 */
export function TokenChainChip({
  chainId,
  symbol,
  onClick,
  disabled,
  placeholderChainName,
}: {
  chainId: number | undefined;
  symbol: TokenSymbol;
  onClick: () => void;
  disabled?: boolean;
  placeholderChainName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex items-center gap-3 rounded-2xl border-0 bg-card/90 py-2 pr-3 pl-2 text-left ring-1 ring-foreground/10 transition-colors hover:bg-card hover:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {chainId ? (
        <TokenWithChainOverlay symbol={symbol} chainId={chainId} size={36} />
      ) : (
        <span className="size-9 rounded-full bg-muted-foreground/30" />
      )}
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">{symbol}</span>
        <span className="text-xs text-muted-foreground">
          {chainId ? chainShortName(chainId) : placeholderChainName}
        </span>
      </span>
      <ChevronDown
        className="size-4 text-muted-foreground transition-transform group-hover:translate-y-px"
        aria-hidden="true"
      />
    </button>
  );
}
