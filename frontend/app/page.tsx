'use client';

import Link from 'next/link';
import {Button} from '@/components/ui/button';

/**
 * Wireframe landing — sets the layout and primary action without making
 * marketing claims. Real copy + animated stats land in Stage 5.5 once
 * the brand decisions are signed off.
 */
export default function Home() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Phase 1</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Cross-chain intents, settled peer-to-peer.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Express a swap once — the protocol matches you with another user across chains, or routes
          through a bonded solver auction when no counterparty exists.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/swap" />}>
          Open swap
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/history" />}>
          View history
        </Button>
      </div>
    </section>
  );
}
