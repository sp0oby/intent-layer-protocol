'use client';

import Link from 'next/link';
import {motion} from 'framer-motion';
import {ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';

const fadeUp = {
  hidden: {opacity: 0, y: 8},
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {delay: i * 0.06, duration: 0.45, ease: 'easeOut' as const},
  }),
};

/**
 * Hero landing. Single-column composition centred in the viewport,
 * glass cards reserved for sub-flows. The cyan accent appears only on
 * the eyebrow chip, the primary CTA, and a single highlighted phrase
 * in the headline — anywhere else and it'd start to feel like AI slop.
 */
export default function Home() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-md">
          <span
            className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]"
            aria-hidden="true"
          />
          Phase 1 — Ethereum ↔ Base
        </span>
      </motion.div>

      <motion.h1
        initial="hidden"
        animate="visible"
        custom={1}
        variants={fadeUp}
        className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
      >
        Cross-chain intents,
        <br />
        settled <span className="text-primary">peer-to-peer</span>.
      </motion.h1>

      <motion.p
        initial="hidden"
        animate="visible"
        custom={2}
        variants={fadeUp}
        className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
      >
        Express a swap once. The protocol matches you with another user across
        chains — or routes through a bonded solver auction when no counterparty
        exists. No bridges, no slippage stacking, no solver margin when a real
        counterparty is on the other side.
      </motion.p>

      <motion.div
        initial="hidden"
        animate="visible"
        custom={3}
        variants={fadeUp}
        className="flex flex-wrap items-center gap-3"
      >
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/swap" />}
          className="group glow-primary h-11 px-6 text-sm font-semibold"
        >
          Open swap
          <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/history" />}
          className="h-11 px-6 text-sm font-medium"
        >
          View history
        </Button>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        custom={4}
        variants={fadeUp}
        className="grid grid-cols-1 gap-3 pt-4 text-xs text-muted-foreground sm:grid-cols-3"
      >
        <Stat label="P2P-first">
          Direct user-to-user matches when both sides exist — no solver fee.
        </Stat>
        <Stat label="Bonded fallback">
          Solver auction kicks in after 30s if no counterparty appears.
        </Stat>
        <Stat label="LayerZero V2">
          Cross-chain messaging with self-serve refund after 6h timeout.
        </Stat>
      </motion.div>
    </section>
  );
}

function Stat({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-4 py-3 backdrop-blur-md">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/90">
        {label}
      </div>
      <div className="mt-1.5 text-foreground/90">{children}</div>
    </div>
  );
}
