'use client';

import {Check, Circle, Clock, X} from 'lucide-react';
import {motion} from 'framer-motion';
import {cn} from '@/lib/utils';
import {useNowSeconds} from '@/hooks/useNow';
import {buildSteps, type StepStatus} from '@/lib/timeline';
import type {IntentState} from '@/lib/types';

/**
 * Linear state machine display. Three forward steps (Submitted →
 * Matched → Settled) plus terminal off-path nodes (Cancelled,
 * Refunded). The active step shows a quiet pulsing dot via Framer
 * Motion; everything else is static — no celebratory motion on
 * SETTLED, just a green check.
 *
 * Auction is treated as a sub-state of "matching in progress" — when
 * state === AUCTIONING the Matched step shows "Auction open" beneath
 * its label.
 *
 * The pure step-mapping logic lives in lib/timeline.ts so it can be
 * unit-tested without rendering React.
 */

export function IntentStatusTimeline({state}: {state: IntentState}) {
  const steps = buildSteps(state);
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step.key} className="flex items-start gap-3">
          <Indicator status={step.status} offPath={step.offPath} />
          <div className="flex-1 pb-1">
            <div
              className={cn(
                'text-sm font-medium',
                step.status === 'future' ? 'text-muted-foreground' : 'text-foreground',
                step.offPath && 'text-foreground'
              )}
            >
              {step.label}
            </div>
            {step.description ? (
              <div className="mt-0.5 text-xs text-muted-foreground">{step.description}</div>
            ) : null}
          </div>
          {index < steps.length - 1 ? <Connector /> : null}
        </li>
      ))}
    </ol>
  );
}

function Indicator({status, offPath}: {status: StepStatus; offPath?: boolean}) {
  if (offPath) {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        <X className="size-3" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'past') {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_12px_color-mix(in_oklch,var(--color-primary)_35%,transparent)]">
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (status === 'active') {
    // Quiet 1.6s pulse on the dot — the only motion in the component.
    // No celebratory burst, no scale animation.
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-card/60 backdrop-blur-md">
        <motion.span
          className="size-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]"
          animate={{opacity: [0.35, 1, 0.35]}}
          transition={{repeat: Infinity, duration: 1.6, ease: 'easeInOut'}}
          aria-hidden="true"
        />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground/60">
      <Circle className="size-1.5 fill-current" aria-hidden="true" />
    </span>
  );
}

function Connector() {
  return null;
}

/** Small inline component the page uses next to the timeline when the
 *  state is AUCTIONING — shows the auction close countdown. Ticks once
 *  a second via useNowSeconds (React 19's react-hooks/purity rule
 *  forbids reading Date.now() in render). */
export function AuctionCountdown({deadline}: {deadline: number}) {
  const now = useNowSeconds(1_000);
  const remaining = deadline - now;
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3" aria-hidden="true" />
      Auction closes in {minutes}m {seconds.toString().padStart(2, '0')}s
    </span>
  );
}
