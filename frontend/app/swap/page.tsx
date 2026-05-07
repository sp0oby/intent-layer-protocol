'use client';

import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';

/**
 * Swap-route placeholder. The real form lands in Stage 5.2 — token select,
 * amount input with USD shadow, ERC-20 approval flow chained behind one
 * button, on-chain submitIntent through wagmi. Keeping the route alive
 * with a clean Card so the AppShell + nav already work end-to-end.
 */
export default function SwapPage() {
  return (
    <section className="mx-auto max-w-xl px-6 py-12">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-2xl">Swap</CardTitle>
          <CardDescription>
            One intent, settled across chains. The full interface lands once token select +
            approval flow are wired.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </CardContent>
      </Card>
    </section>
  );
}
