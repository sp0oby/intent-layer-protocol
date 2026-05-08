'use client';

import {useUnmatchedIntents} from '@/hooks/useIntents';

/**
 * Across-style stats row. Massive mono numerals with tiny uppercase
 * labels underneath. Numbers must read as live data when the API has
 * any, and degrade silently to honest static values otherwise — no
 * fake numbers, no marketing inflation.
 *
 * Layout: 4 evenly-distributed columns separated by hairline dividers.
 * The dividers come from the right border of every cell except the
 * last; on stacked mobile they collapse to bottom borders.
 */
export function StatsStrip() {
  const {data} = useUnmatchedIntents();
  const liveCount = data?.length ?? 0;

  const items: Array<{value: string; label: string}> = [
    {value: '2', label: 'Chains'},
    {value: liveCount.toString().padStart(2, '0'), label: 'Open intents'},
    {value: '6h', label: 'Refund window'},
    {value: '<5m', label: 'Settlement target'},
  ];

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-card/40 ring-1 ring-foreground/10 backdrop-blur-xl sm:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={
            'relative px-6 py-8 ' +
            (i < 2 ? 'border-b border-foreground/10 sm:border-b-0 ' : '') +
            (i % 2 === 0 ? 'border-r border-foreground/10 ' : '') +
            'sm:border-r sm:last:border-r-0'
          }
        >
          <div className="font-mono text-5xl font-medium tabular-nums tracking-tighter text-foreground">
            {item.value}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
