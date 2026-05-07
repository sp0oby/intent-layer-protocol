'use client';

import {SwapForm} from '@/components/SwapForm';

/**
 * Swap route — the SwapForm component owns the state machine, approval
 * flow, and on-chain submitIntent call. Page-level concern is just
 * layout + width.
 */
export default function SwapPage() {
  return (
    <section className="mx-auto max-w-xl px-6 py-12">
      <SwapForm />
    </section>
  );
}
