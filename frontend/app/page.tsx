'use client';

import Link from 'next/link';
import {motion} from 'framer-motion';
import {Button} from '@/components/ui/button';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16 font-[family-name:var(--font-geist-sans)]">
      <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={{duration: 0.4}}>
        <p className="text-sm uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Phase 1 MVP</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Intent Protocol Layer</h1>
        <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-300">
          Express a cross-chain swap intent once — match peer-to-peer or fall back to solver auctions. This repo is a
          developer skeleton; contracts and APIs are stubs.
        </p>
      </motion.div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/swap">Open swap</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/intent/demo-intent">Sample intent status</Link>
        </Button>
      </div>
    </main>
  );
}
