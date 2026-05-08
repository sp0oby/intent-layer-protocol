'use client';

import {Check, Search} from 'lucide-react';
import {useMemo, useState} from 'react';
import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {ChainIcon} from '@/components/icons/ChainIcon';
import {TokenIcon} from '@/components/icons/TokenIcon';
import {SUPPORTED_CHAINS, chainShortName} from '@/lib/chains';
import {tokensForChain, type TokenSymbol} from '@/lib/tokens';

/**
 * Across-style token picker. Two-column dialog: chain list on the
 * left, tokens for the selected chain on the right. Both columns have
 * a search input. Clicking a token fires `onPick(chainId, symbol)` and
 * closes the dialog; the parent decides what that means — From picker
 * switches the wallet directly, To picker switches to the partner.
 *
 * Internal state: a `selectedChainId` that drives the right column's
 * filter. Initialised from `currentChainId` so the user lands on the
 * column they're already on; if currentChainId is undefined, defaults
 * to the first supported chain.
 */
export function TokenPickerDialog({
  open,
  onOpenChange,
  title,
  currentChainId,
  currentSymbol,
  onPick,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  currentChainId: number | undefined;
  currentSymbol: TokenSymbol;
  onPick: (chainId: number, symbol: TokenSymbol) => void;
}) {
  const [selectedChainId, setSelectedChainId] = useState<number>(
    currentChainId ?? SUPPORTED_CHAINS[0].id
  );
  const [chainSearch, setChainSearch] = useState('');
  const [tokenSearch, setTokenSearch] = useState('');

  // React 19's react-hooks/set-state-in-effect rule forbids setState
  // inside useEffect; the canonical replacement is the "adjust state on
  // prop change" pattern — track the previous value of `open` in state
  // and reset derived state during render whenever it transitions.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setChainSearch('');
      setTokenSearch('');
      if (currentChainId !== undefined) setSelectedChainId(currentChainId);
    }
  }

  const filteredChains = useMemo(() => {
    const q = chainSearch.trim().toLowerCase();
    if (!q) return SUPPORTED_CHAINS;
    return SUPPORTED_CHAINS.filter((c) => chainShortName(c.id).toLowerCase().includes(q));
  }, [chainSearch]);

  const filteredTokens = useMemo(() => {
    const all = tokensForChain(selectedChainId);
    const q = tokenSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [selectedChainId, tokenSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[40rem] max-h-[85vh] w-full !max-w-5xl gap-0 overflow-hidden rounded-2xl bg-popover p-0 ring-1 ring-foreground/10">
        <header className="flex shrink-0 items-center justify-between border-b border-foreground/10 px-6 py-5">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </DialogTitle>
        </header>

        <div className="grid min-h-0 grid-cols-1 divide-y divide-foreground/10 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:divide-x md:divide-y-0">
          {/* Chain column */}
          <section className="flex min-h-0 flex-col">
            <div className="md:hidden border-b border-foreground/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              1. Pick a chain
            </div>
            <div className="shrink-0 border-b border-foreground/10 p-4">
              <SearchInput
                placeholder="Search chains"
                value={chainSearch}
                onChange={setChainSearch}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Supported chains
              </div>
              <ul className="space-y-0.5">
                {filteredChains.map((chain) => {
                  const active = chain.id === selectedChainId;
                  return (
                    <li key={chain.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedChainId(chain.id)}
                        className={
                          'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ' +
                          (active
                            ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                            : 'text-foreground/90 hover:bg-foreground/5')
                        }
                      >
                        <ChainIcon chainId={chain.id} size={28} />
                        <span className="flex-1 truncate text-left font-medium">
                          {chainShortName(chain.id)}
                        </span>
                        {active ? (
                          <Check className="size-4 text-primary" aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {filteredChains.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No matches
                  </li>
                ) : null}
              </ul>
            </div>
          </section>

          {/* Token column */}
          <section className="flex min-h-0 flex-col">
            <div className="md:hidden border-b border-foreground/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              2. Pick a token
            </div>
            <div className="shrink-0 border-b border-foreground/10 p-4">
              <SearchInput
                placeholder="Search tokens"
                value={tokenSearch}
                onChange={setTokenSearch}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tokens on {chainShortName(selectedChainId)}
              </div>
              <ul className="space-y-0.5">
                {filteredTokens.map((token) => {
                  const active =
                    token.symbol === currentSymbol && selectedChainId === currentChainId;
                  return (
                    <li key={`${selectedChainId}-${token.symbol}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(selectedChainId, token.symbol);
                          onOpenChange(false);
                        }}
                        className={
                          'flex w-full items-center gap-3.5 rounded-lg px-3 py-3 text-sm transition-colors ' +
                          (active
                            ? 'bg-primary/10 ring-1 ring-primary/40'
                            : 'hover:bg-foreground/5')
                        }
                      >
                        <TokenWithChainOverlay
                          symbol={token.symbol}
                          chainId={selectedChainId}
                          size={40}
                        />
                        <div className="flex flex-1 flex-col items-start gap-0.5 text-left">
                          <span className="text-[15px] font-semibold text-foreground">
                            {token.name}{' '}
                            <span className="ml-1 text-xs font-medium text-muted-foreground">
                              {token.symbol}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {chainShortName(selectedChainId)}
                          </span>
                        </div>
                        {active ? (
                          <Check className="size-4 text-primary" aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {filteredTokens.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No tokens listed for this chain
                  </li>
                ) : null}
              </ul>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-lg border-0 bg-foreground/[0.04] pl-10 text-sm placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

/**
 * Token icon with a small chain badge overlapping the bottom-right.
 * Used both inside the picker rows and on the chip in the swap card —
 * this is the across-style "single combined visual" we're aligning to.
 */
export function TokenWithChainOverlay({
  symbol,
  chainId,
  size = 36,
}: {
  symbol: TokenSymbol;
  chainId: number;
  size?: number;
}) {
  // Chain badge is roughly 45% of the token icon, with a 2px ring of
  // the surrounding bg punching it out of the token underneath.
  const badge = Math.round(size * 0.45);
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{width: size, height: size}}
    >
      <TokenIcon symbol={symbol} size={size} />
      <span
        className="absolute -right-0.5 -bottom-0.5 inline-flex rounded-full bg-card ring-2 ring-card"
        aria-hidden="true"
      >
        <ChainIcon chainId={chainId} size={badge} />
      </span>
    </span>
  );
}
