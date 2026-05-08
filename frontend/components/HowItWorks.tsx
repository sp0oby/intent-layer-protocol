/**
 * Editorial three-step section. Numerals (01 / 02 / 03) carry the visual
 * hierarchy; no icons, no stat cards — type rhythm does the work. Across
 * uses a similar pattern in its "How does it work" block: oversized step
 * numbers in a muted weight, restrained body copy, generous gutters.
 *
 * Layout: 12-column grid; numerals span 2 cols, copy spans 8, the right
 * 2 cols are intentionally empty to give each step asymmetric breathing
 * room.
 */
export function HowItWorks() {
  const steps = [
    {
      n: '01',
      head: 'Express the swap once.',
      body:
        'Sign a single intent that says how much you send, what you want, and the chain you want it on. The protocol takes it from there — you do not bridge first.',
    },
    {
      n: '02',
      head: 'Match peer-to-peer when both sides exist.',
      body:
        'If another user wants the inverse trade, the protocol pairs you directly. Each side keeps the spread that would otherwise pay a solver, and settlement is atomic across chains.',
    },
    {
      n: '03',
      head: 'Auction fallback when no counterparty appears.',
      body:
        'After 30 seconds without a P2P match, bonded solvers bid for the right to fill. The cheapest bid wins; the user’s minOut is enforced on-chain. Refund is self-serve after a 6h timeout.',
    },
  ];

  return (
    <section className="space-y-2">
      <header className="mb-10">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/85">
          How it works
        </div>
        <h2 className="mt-3 max-w-xl text-balance text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
          One intent, two settlement paths, zero bridges.
        </h2>
      </header>
      <ol className="divide-y divide-foreground/10">
        {steps.map((s) => (
          <li
            key={s.n}
            className="grid grid-cols-12 items-baseline gap-x-6 gap-y-2 py-10 sm:gap-x-10"
          >
            <div className="col-span-12 font-mono text-5xl font-light tabular-nums text-muted-foreground/60 sm:col-span-2 sm:text-6xl">
              {s.n}
            </div>
            <div className="col-span-12 sm:col-span-8">
              <h3 className="text-xl font-medium tracking-tight text-foreground sm:text-2xl">
                {s.head}
              </h3>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
