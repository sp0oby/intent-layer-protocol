'use client';

import Link from 'next/link';
import {useState} from 'react';
import {WalletBar} from '@/components/WalletBar';
import {Button} from '@/components/ui/button';
import {useUiStore} from '@/lib/ui-store';

export default function SwapPage() {
  const lastSubmittedIntentId = useUiStore((s) => s.lastSubmittedIntentId);
  const setLastId = useUiStore((s) => s.setLastSubmittedIntentId);
  const [stubId, setStubId] = useState(`intent-${Math.random().toString(36).slice(2, 10)}`);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Home
        </Link>
        <WalletBar />
      </header>
      <div>
        <h1 className="text-2xl font-semibold">Create intent (stub)</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Wire this form to `IntentSettler.submitIntent` once addresses and ABIs are deployed.
        </p>
      </div>
      <form
        className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          setLastId(stubId);
        }}
      >
        <label className="text-sm font-medium">
          Stub intent id
          <input
            className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            value={stubId}
            onChange={(e) => setStubId(e.target.value)}
          />
        </label>
        <Button type="submit">Save reference (local state only)</Button>
      </form>
      {lastSubmittedIntentId ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Last reference:{' '}
          <Link className="font-mono underline" href={`/intent/${lastSubmittedIntentId}`}>
            {lastSubmittedIntentId}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
