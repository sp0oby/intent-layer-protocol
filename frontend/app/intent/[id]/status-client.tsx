'use client';

import {useQuery} from '@tanstack/react-query';

type IntentRow = {
  id: string;
  state: string;
  sourceChainId: number;
  destChainId: number;
  user: string;
};

async function fetchIntents(): Promise<IntentRow[]> {
  const res = await fetch('/api/intents', {cache: 'no-store'});
  if (!res.ok) {
    throw new Error('Failed to load intents');
  }
  const data = (await res.json()) as {intents: IntentRow[]};
  return data.intents;
}

export function IntentStatusClient({id}: {id: string}) {
  const {data, isLoading, error} = useQuery({
    queryKey: ['intents'],
    queryFn: fetchIntents,
  });

  const match = data?.find((i) => i.id === id);

  return (
    <div className="mt-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intent status</h1>
      <p className="font-mono text-sm text-neutral-600 dark:text-neutral-400">{id}</p>
      {isLoading && <p className="text-sm">Loading mock API…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {match ? (
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-neutral-500">State</dt>
            <dd className="font-medium">{match.state}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Route</dt>
            <dd>
              {match.sourceChainId} → {match.destChainId}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">User</dt>
            <dd className="font-mono text-xs">{match.user}</dd>
          </div>
        </dl>
      ) : null}
      {!isLoading && !match && data ? (
        <p className="text-sm text-neutral-600">
          No matching row in dummy API. IDs from `/api/intents` include: {data.map((i) => i.id).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
