'use client';

import {Settings2} from 'lucide-react';
import {useState} from 'react';
import {Input} from '@/components/ui/input';

export interface SwapSettingsValue {
  deadlineMinutes: number;
  /** Optional refund-to override. Empty / unset means "use the connected
   *  wallet" — the contract treats the zero address that way. */
  refundTo: string;
}

const DEADLINE_OPTIONS = [
  {label: '5m', minutes: 5},
  {label: '30m', minutes: 30},
  {label: '1h', minutes: 60},
  {label: '24h', minutes: 1440},
];

const isValidAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s);

/**
 * Tiny settings popover for the swap card. Click the gear → small
 * panel slides in below the button with two controls:
 *   - Deadline (one of 5m / 30m / 1h / 24h)
 *   - Refund-to (address input; empty means use the wallet)
 *
 * Both fields are persisted on the parent's controlled state. The
 * popover dismisses on click-away or Escape (Esc handled by the
 * outside-click button).
 */
export function SwapSettings({
  value,
  onChange,
}: {
  value: SwapSettingsValue;
  onChange: (next: SwapSettingsValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [refundDraft, setRefundDraft] = useState(value.refundTo);

  const isCustom = value.deadlineMinutes !== 30;
  const refundError = refundDraft !== '' && !isValidAddress(refundDraft);

  const commitRefund = () => {
    if (refundError) return;
    onChange({...value, refundTo: refundDraft});
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Swap settings"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className={
          'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground ' +
          (isCustom || value.refundTo !== '' ? 'text-primary' : '')
        }
      >
        <Settings2 className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close settings"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => {
              commitRefund();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-72 rounded-2xl bg-popover p-4 shadow-2xl ring-1 ring-foreground/10"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Deadline
            </div>
            <div className="mt-2 flex items-center gap-1">
              {DEADLINE_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => onChange({...value, deadlineMinutes: opt.minutes})}
                  className={
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors ' +
                    (value.deadlineMinutes === opt.minutes
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                      : 'bg-card/70 text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Refund recipient
            </div>
            <Input
              value={refundDraft}
              onChange={(e) => setRefundDraft(e.target.value.trim())}
              onBlur={commitRefund}
              placeholder="0x… (defaults to wallet)"
              className={
                'mt-2 h-9 rounded-md font-mono text-xs ' +
                (refundError ? 'ring-2 ring-destructive/40' : '')
              }
              aria-invalid={refundError ? true : undefined}
              spellCheck={false}
            />
            {refundError ? (
              <p className="mt-1.5 text-[11px] text-destructive">
                Must be a 0x-prefixed 20-byte address.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Empty = wallet receives any refund.
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
