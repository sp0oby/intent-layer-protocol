import type {Metadata} from 'next';
import {SwapForm} from '@/components/SwapForm';

export const metadata: Metadata = {
  title: 'Swap',
  description: 'Express a cross-chain intent. P2P-first matching with auction fallback.',
};

/**
 * Swap route. Page-level header sits above the card (matching the
 * history page pattern), then the SwapForm component owns its own
 * state machine, approval flow, and on-chain submitIntent call.
 */
export default function SwapPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Swap
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Express a cross-chain intent. The protocol matches you peer-to-peer
          first.
        </p>
      </header>
      <SwapForm />
    </section>
  );
}
