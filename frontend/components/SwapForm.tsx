'use client';

import {ArrowDown} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useChainId, useConnection} from 'wagmi';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {SubmitIntentButton} from '@/components/SubmitIntentButton';
import {chainShortName, isSupportedChain} from '@/lib/chains';
import {sanitizeDecimal} from '@/lib/decimal-input';
import {findToken, partnerChainOf, tokensForChain, type TokenSymbol} from '@/lib/tokens';

/** Default intent deadline. The matcher's poll cadence + LZ delivery
 *  budget fits comfortably under 30 min; advanced settings will let
 *  the user shorten or extend this. */
const DEFAULT_DEADLINE_MINUTES = 30;

/**
 * Cross-chain swap form. Source chain is derived from the wallet's
 * connected chain — if the user wants to swap *from* the other side,
 * they switch network (the AppShell's NetworkBanner makes this one
 * click). Destination chain auto-derives from the partner mapping.
 *
 * Wireframe phase: pure b&w, no live USD shadow yet (needs price feed).
 * Validation messages live in the submit button label so there's a
 * single signal for "what's wrong."
 */
export function SwapForm() {
  const {isConnected} = useConnection();
  const chainId = useChainId();

  // Source chain follows the connected wallet. When the user is on an
  // unsupported chain, AppShell's NetworkBanner above already shows the
  // switch UX — we just disable inputs.
  const sourceChainId = isConnected && isSupportedChain(chainId) ? chainId : undefined;
  const destChainId = useMemo(() => partnerChainOf(sourceChainId), [sourceChainId]);

  const sourceTokens = useMemo(() => tokensForChain(sourceChainId), [sourceChainId]);
  const destTokens = useMemo(() => tokensForChain(destChainId), [destChainId]);

  // User-picked symbols. Defaults to ETH/USDC; either side can be
  // changed via the Select. The *effective* symbol below derives from
  // these so a chain switch that drops a token (e.g. USDT not on Base)
  // falls through automatically without firing a state update — keeps
  // React 19's set-state-in-effect rule happy.
  const [pickedSourceSymbol, setSourceSymbol] = useState<TokenSymbol>('ETH');
  const [pickedDestSymbol, setDestSymbol] = useState<TokenSymbol>('USDC');
  const [sourceAmount, setSourceAmount] = useState('');
  const [minDestAmount, setMinDestAmount] = useState('');

  const sourceSymbol = useMemo(
    () =>
      sourceTokens.find((t) => t.symbol === pickedSourceSymbol)?.symbol ??
      sourceTokens[0]?.symbol ??
      pickedSourceSymbol,
    [sourceTokens, pickedSourceSymbol]
  );
  const destSymbol = useMemo(
    () =>
      destTokens.find((t) => t.symbol === pickedDestSymbol)?.symbol ??
      destTokens[0]?.symbol ??
      pickedDestSymbol,
    [destTokens, pickedDestSymbol]
  );

  const sourceToken = useMemo(
    () => findToken(sourceChainId, sourceSymbol),
    [sourceChainId, sourceSymbol]
  );
  const destToken = useMemo(() => findToken(destChainId, destSymbol), [destChainId, destSymbol]);

  return (
    <Card className="border-border/40 shadow-2xl shadow-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-semibold tracking-tight">Swap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <Side
          legend="You send"
          chainId={sourceChainId}
          tokens={sourceTokens}
          symbol={sourceSymbol}
          onSymbolChange={setSourceSymbol}
          amount={sourceAmount}
          onAmountChange={setSourceAmount}
          amountPlaceholder="0.0"
          amountLabel="You send"
        />

        <div className="relative -my-3 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:text-foreground">
            <ArrowDown className="size-4" aria-hidden="true" />
          </span>
        </div>

        <Side
          legend="You receive (min)"
          chainId={destChainId}
          tokens={destTokens}
          symbol={destSymbol}
          onSymbolChange={setDestSymbol}
          amount={minDestAmount}
          onAmountChange={setMinDestAmount}
          amountPlaceholder="0.0"
          amountLabel="You receive (min)"
        />

        <div className="pt-4">
          <SubmitIntentButton
            sourceChainId={sourceChainId}
            destChainId={destChainId}
            sourceToken={sourceToken}
            destToken={destToken}
            sourceAmount={sourceAmount}
            minDestAmount={minDestAmount}
            deadlineMinutes={DEFAULT_DEADLINE_MINUTES}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Side({
  legend,
  chainId,
  tokens,
  symbol,
  onSymbolChange,
  amount,
  onAmountChange,
  amountLabel,
  amountPlaceholder,
}: {
  legend: string;
  chainId: number | undefined;
  tokens: ReturnType<typeof tokensForChain>;
  symbol: TokenSymbol;
  onSymbolChange: (next: TokenSymbol) => void;
  amount: string;
  onAmountChange: (next: string) => void;
  amountLabel: string;
  amountPlaceholder: string;
}) {
  const fieldId = `${legend.toLowerCase().replace(/\s+/g, '-')}-amount`;
  return (
    <div className="group/side rounded-2xl border border-border/60 bg-background/40 p-4 transition-colors focus-within:border-primary/40 hover:border-border">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {legend}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {chainId ? chainShortName(chainId) : '— connect wallet —'}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Input
          id={fieldId}
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange(sanitizeDecimal(e.target.value))}
          placeholder={amountPlaceholder}
          disabled={!chainId}
          className="h-auto border-0 bg-transparent px-0 font-mono text-3xl font-semibold tabular-nums shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40 dark:bg-transparent"
        />
        <Select
          value={symbol}
          onValueChange={(v) => v && onSymbolChange(v as TokenSymbol)}
          disabled={!chainId || tokens.length === 0}
        >
          <SelectTrigger className="h-10 min-w-[6.5rem] rounded-full border-border/70 bg-card/60 px-3.5 text-sm font-semibold backdrop-blur-md transition-colors hover:border-primary/40">
            <SelectValue placeholder="Token" />
          </SelectTrigger>
          <SelectContent>
            {tokens.map((token) => (
              <SelectItem key={token.symbol} value={token.symbol}>
                {token.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Label htmlFor={fieldId} className="sr-only">
        {amountLabel}
      </Label>
    </div>
  );
}

