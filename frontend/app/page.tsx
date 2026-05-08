'use client';

import Link from 'next/link';
import {motion} from 'framer-motion';
import {ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {SwapPreview} from '@/components/SwapPreview';
import {StatsStrip} from '@/components/StatsStrip';
import {HowItWorks} from '@/components/HowItWorks';
import {ActivityTicker} from '@/components/ActivityTicker';

const fadeUp = {
  hidden: {opacity: 0, y: 8},
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {delay: i * 0.06, duration: 0.45, ease: 'easeOut' as const},
  }),
};

/**
 * Landing page rebuild. Editorial composition: hero copy left, animated
 * cross-chain visual right; live stats strip; type-driven How-it-works;
 * live activity rail; final CTA. Wider container (max-w-7xl) overrides
 * the AppShell's default max-w-5xl — the chrome stays tight, the
 * landing breathes.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-24">
      <Hero />
      <div className="mt-16 sm:mt-24">
        <StatsStrip />
      </div>
      <div className="mt-24 sm:mt-36">
        <HowItWorks />
      </div>
      <div className="mt-20 sm:mt-28">
        <ActivityTicker />
      </div>
      <FinalCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="grid grid-cols-12 items-center gap-x-8 gap-y-14 pt-16 sm:pt-24">
      <div className="col-span-12 lg:col-span-6">
        {/* Display headline. Real type rhythm: line one tight, line two
            shifted in colour weight. tracking-[-0.04em] is the Across-y
            display compression; balance keeps the wrap honest. The
            wordmark sits in the header — no eyebrow line repeats it
            here. */}
        <motion.h1
          initial="hidden"
          animate="visible"
          custom={1}
          variants={fadeUp}
          className="text-balance text-[2.75rem] font-medium leading-[0.96] tracking-[-0.04em] sm:text-[4.25rem]"
        >
          Cross-chain swaps,
          <br />
          <span className="text-muted-foreground">settled directly between users.</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          custom={2}
          variants={fadeUp}
          className="mt-7 max-w-lg text-balance text-base leading-relaxed text-muted-foreground sm:text-[17px]"
        >
          Sign one intent and the protocol pairs you with another user across
          Ethereum and Base. When no counterparty exists, bonded solvers bid
          against your minimum — never above it.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          custom={3}
          variants={fadeUp}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/swap" />}
            className="group glow-primary h-12 rounded-full px-7 text-sm font-semibold"
          >
            Open swap
            <ArrowRight className="ml-1.5 size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Link
            href="https://github.com/sp0oby/intent-layer-protocol"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Read the protocol →
          </Link>
        </motion.div>
      </div>

      {/* The actual product as the hero visual — read-only preview of
          the swap card with example data. Floats glassy on lg+, stacks
          below copy on mobile. */}
      <div className="col-span-12 lg:col-span-6">
        <SwapPreview />
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mt-28 sm:mt-40">
      <div className="grid grid-cols-12 items-end gap-y-8">
        <div className="col-span-12 lg:col-span-8">
          <h2 className="text-balance text-3xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
            Stop bridging.
            <br />
            <span className="text-muted-foreground">Start expressing intent.</span>
          </h2>
        </div>
        <div className="col-span-12 lg:col-span-4 lg:text-right">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/swap" />}
            className="group glow-primary h-12 rounded-full px-7 text-sm font-semibold"
          >
            Try it now
            <ArrowRight className="ml-1.5 size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
