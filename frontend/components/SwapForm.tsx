'use client';

import {ArrowDown} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useChainId, useConnection, useSwitchChain} from 'wagmi';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {SubmitIntentButton} from '@/components/SubmitIntentButton';
import {SwapSettings, type SwapSettingsValue} from '@/components/SwapSettings';
import {TokenChainChip} from '@/components/TokenChainChip';
import {TokenPickerDialog} from '@/components/TokenPickerDialog';
import {isSupportedChain} from '@/lib/chains';
import {sanitizeDecimal} from '@/lib/decimal-input';
import {
  applySlippage,
  DEFAULT_SLIPPAGE_BPS,
  expectedDestAmount,
  formatExpected,
  indicativeRate,
  SLIPPAGE_OPTIONS_BPS,
} from '@/lib/rates';
import {findToken, partnerChainOf, type TokenSymbol} from '@/lib/tokens';

const DEFAULT_SETTINGS: SwapSettingsValue = {
  deadlineMinutes: 30,
  refundTo: '',
};

/**
 * Cross-chain swap form. Single user-typed amount on the From side; the
 * To side auto-fills with the expected destination amount derived from
 * an indicative rate map (`lib/rates.ts`). The user picks a slippage
 * tolerance via a small pill row and we submit
 *   `minDestAmount = expected × (1 - slippage)`
 * on-chain — that's the worst-case price the user agrees to.
 *
 * The picker, chain switching, flip behaviour all stay the same. The
 * route preview no longer lives on this page (it surfaces on the
 * status page once the intent is submitted).
 *
 * The indicative rate is dev-only — replace `lib/rates.ts` with a real
 * feed before mainnet.
 */
export function SwapForm() {
  const {isConnected} = useConnection();
  const chainId = useChainId();
  const {switchChain, isPending: switchPending} = useSwitchChain();

  const sourceChainId = isConnected && isSupportedChain(chainId) ? chainId : undefined;
  const destChainId = useMemo(() => partnerChainOf(sourceChainId), [sourceChainId]);

  const [sourceSymbol, setSourceSymbol] = useState<TokenSymbol>('ETH');
  const [destSymbol, setDestSymbol] = useState<TokenSymbol>('USDC');
  const [sourceAmount, setSourceAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [settings, setSettings] = useState<SwapSettingsValue>(DEFAULT_SETTINGS);

  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);

  const sourceToken = useMemo(
    () => findToken(sourceChainId, sourceSymbol),
    [sourceChainId, sourceSymbol]
  );
  const destToken = useMemo(() => findToken(destChainId, destSymbol), [destChainId, destSymbol]);

  // Auto-fill: expected destination at the indicative rate, then floor
  // by the user's slippage tolerance for the on-chain min.
  const expected = useMemo(
    () => expectedDestAmount(sourceAmount, sourceSymbol, destSymbol),
    [sourceAmount, sourceSymbol, destSymbol]
  );
  const minDest = useMemo(
    () => (expected === null ? null : applySlippage(expected, slippageBps)),
    [expected, slippageBps]
  );

  // Decimal-string form the SubmitIntentButton hands to viem's parseUnits.
  // Round to the destination token's decimals so we never produce a
  // string parseUnits can't accept (e.g. 19 fractional digits on USDC).
  const minDestAmountStr = useMemo(() => {
    if (minDest === null) return '';
    const decimals = destToken?.decimals ?? 18;
    return minDest.toFixed(decimals);
  }, [minDest, destToken]);

  const rate = useMemo(() => indicativeRate(sourceSymbol, destSymbol), [sourceSymbol, destSymbol]);

  const flipChain = () => {
    if (!destChainId || switchPending) return;
    switchChain({chainId: destChainId});
  };

  const handleFromPick = (pickedChainId: number, pickedSymbol: TokenSymbol) => {
    setSourceSymbol(pickedSymbol);
    if (!isSupportedChain(pickedChainId)) return;
    if (pickedChainId !== sourceChainId) {
      switchChain({chainId: pickedChainId});
    }
  };

  const handleToPick = (pickedChainId: number, pickedSymbol: TokenSymbol) => {
    setDestSymbol(pickedSymbol);
    const partner = partnerChainOf(pickedChainId);
    if (!partner) return;
    if (partner !== sourceChainId) {
      switchChain({chainId: partner});
    }
  };

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-16 -z-10 rounded-[40%] bg-[radial-gradient(ellipse_55%_50%_at_50%_50%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_70%)] blur-2xl"
      />

      <div className="overflow-hidden rounded-3xl bg-card/70 p-6 shadow-2xl shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur-2xl sm:p-7">
        <div className="mb-3 flex items-center justify-end">
          <SwapSettings value={settings} onChange={setSettings} />
        </div>
        <div className="space-y-2">
          <FromSide
            chainId={sourceChainId}
            symbol={sourceSymbol}
            amount={sourceAmount}
            onAmountChange={setSourceAmount}
            onChipClick={() => setFromPickerOpen(true)}
            placeholderChainName="Connect wallet"
            chainSwitchPending={switchPending}
          />

          <FlipDivider onFlip={flipChain} disabled={!destChainId || switchPending} />

          <ToSide
            chainId={destChainId}
            symbol={destSymbol}
            expected={expected}
            onChipClick={() => setToPickerOpen(true)}
            placeholderChainName="—"
            chainSwitchPending={switchPending}
          />
        </div>

        <SlippageRow
          slippageBps={slippageBps}
          onChange={setSlippageBps}
          minDest={minDest}
          destSymbol={destSymbol}
          rate={rate}
          srcSymbol={sourceSymbol}
        />

        <div className="mt-5">
          <SubmitIntentButton
            sourceChainId={sourceChainId}
            destChainId={destChainId}
            sourceToken={sourceToken}
            destToken={destToken}
            sourceAmount={sourceAmount}
            minDestAmount={minDestAmountStr}
            deadlineMinutes={settings.deadlineMinutes}
            refundTo={settings.refundTo}
          />
        </div>
      </div>

      <TokenPickerDialog
        open={fromPickerOpen}
        onOpenChange={setFromPickerOpen}
        title="Select origin token"
        currentChainId={sourceChainId}
        currentSymbol={sourceSymbol}
        onPick={handleFromPick}
      />
      <TokenPickerDialog
        open={toPickerOpen}
        onOpenChange={setToPickerOpen}
        title="Select destination token"
        currentChainId={destChainId}
        currentSymbol={destSymbol}
        onPick={handleToPick}
      />
    </div>
  );
}

function FromSide({
  chainId,
  symbol,
  amount,
  onAmountChange,
  onChipClick,
  placeholderChainName,
  chainSwitchPending,
}: {
  chainId: number | undefined;
  symbol: TokenSymbol;
  amount: string;
  onAmountChange: (next: string) => void;
  onChipClick: () => void;
  placeholderChainName: string;
  chainSwitchPending: boolean;
}) {
  const fieldId = 'from-amount';
  return (
    <div className="rounded-2xl bg-background/40 p-5 ring-1 ring-foreground/5 transition-colors focus-within:ring-primary/30 hover:bg-background/50">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
        From
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <Input
          id={fieldId}
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange(sanitizeDecimal(e.target.value))}
          placeholder="0.0"
          disabled={!chainId}
          // The shared Input primitive bakes in `md:text-sm` — without
          // an explicit md:text-5xl override, our display-size text is
          // overwritten on desktop and the From amount renders smaller
          // than the read-only To · expected span next to it. Mobile
          // gets a smaller scale (36px) so a 4-digit amount + the
          // chip + section padding fits a 375px viewport without
          // truncating.
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-[2.25rem] font-medium tabular-nums tracking-tight shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40 dark:bg-transparent sm:text-[2.75rem] md:text-5xl"
        />
        <TokenChainChip
          chainId={chainId}
          symbol={symbol}
          onClick={onChipClick}
          disabled={chainSwitchPending}
          placeholderChainName={placeholderChainName}
        />
      </div>
      <Label htmlFor={fieldId} className="sr-only">
        From amount
      </Label>
    </div>
  );
}

/**
 * Read-only destination side. Displays the indicative-rate expected
 * output. The user adjusts the actual on-chain min via the slippage
 * row below; this section is informational only, no input. A subtle
 * "expected" cyan label disambiguates from the on-chain floor.
 */
function ToSide({
  chainId,
  symbol,
  expected,
  onChipClick,
  placeholderChainName,
  chainSwitchPending,
}: {
  chainId: number | undefined;
  symbol: TokenSymbol;
  expected: number | null;
  onChipClick: () => void;
  placeholderChainName: string;
  chainSwitchPending: boolean;
}) {
  const display = formatExpected(expected);
  return (
    <div className="rounded-2xl bg-background/40 p-5 ring-1 ring-foreground/5 hover:bg-background/50">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
        To · expected
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span
          className={
            'min-w-0 flex-1 truncate font-mono text-[2.25rem] font-medium tabular-nums tracking-tight sm:text-[2.75rem] md:text-5xl ' +
            (display ? 'text-foreground' : 'text-muted-foreground/40')
          }
        >
          {display || '0.0'}
        </span>
        <TokenChainChip
          chainId={chainId}
          symbol={symbol}
          onClick={onChipClick}
          disabled={chainSwitchPending}
          placeholderChainName={placeholderChainName}
        />
      </div>
    </div>
  );
}

function SlippageRow({
  slippageBps,
  onChange,
  minDest,
  destSymbol,
  rate,
  srcSymbol,
}: {
  slippageBps: number;
  onChange: (next: number) => void;
  minDest: number | null;
  destSymbol: TokenSymbol;
  rate: number;
  srcSymbol: TokenSymbol;
}) {
  return (
    <div className="mt-5 rounded-2xl bg-background/40 px-5 py-4 ring-1 ring-foreground/5">
      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Slippage
          </span>
          <div className="flex items-center gap-1">
            {SLIPPAGE_OPTIONS_BPS.map((bps) => (
              <SlippagePill
                key={bps}
                bps={bps}
                active={bps === slippageBps}
                onClick={() => onChange(bps)}
              />
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Min received
          </div>
          <div className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">
            {minDest === null
              ? 'Enter amount'
              : `≥ ${formatExpected(minDest)} ${destSymbol}`}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-foreground/5 pt-3 text-xs">
        <span className="text-muted-foreground">Indicative rate</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {isFinite(rate)
            ? `1 ${srcSymbol} ≈ ${formatExpected(rate)} ${destSymbol}`
            : '—'}
        </span>
      </div>
    </div>
  );
}

function SlippagePill({
  bps,
  active,
  onClick,
}: {
  bps: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors ' +
        (active
          ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
          : 'bg-card/70 text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground')
      }
    >
      {bps / 100}%
    </button>
  );
}

function FlipDivider({onFlip, disabled}: {onFlip: () => void; disabled: boolean}) {
  return (
    <div className="relative -my-1 flex items-center justify-center">
      <button
        type="button"
        aria-label="Flip swap direction"
        onClick={onFlip}
        disabled={disabled}
        className="flex size-10 items-center justify-center rounded-xl bg-card text-foreground ring-1 ring-foreground/15 transition-all hover:bg-card hover:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
