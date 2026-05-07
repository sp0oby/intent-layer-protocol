/**
 * TanStack Query hooks against the backend's intent API.
 *
 * Naming mirrors the API surface so the call sites read naturally:
 *   useUnmatchedIntents()      -> GET /api/intents/unmatched
 *   useAuctioningIntents()     -> GET /api/intents/auctioning
 *   useIntent(intentHash)      -> GET /api/intents/:hash (single intent)
 *
 * `useIntentStatus(hash)` lives in its own file because it owns a
 * WebSocket lifecycle.
 */

import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {IntentRecord} from '@/lib/types';

/** All match-eligible intents (PENDING or AUCTIONING, not expired). */
export function useUnmatchedIntents(chainId?: number) {
  return useQuery({
    queryKey: ['intents', 'unmatched', chainId ?? 'all'],
    queryFn: () => api.listUnmatched(chainId),
    select: (data): IntentRecord[] => data.intents,
    refetchInterval: 5_000,
    staleTime: 2_500,
  });
}

/** Subset filtered to just AUCTIONING. Solver dashboards subscribe here. */
export function useAuctioningIntents(chainId?: number) {
  return useQuery({
    queryKey: ['intents', 'auctioning', chainId ?? 'all'],
    queryFn: () => api.listAuctioning(chainId),
    select: (data): IntentRecord[] => data.intents,
    refetchInterval: 3_000,
    staleTime: 1_500,
  });
}

/** Single intent by hash. Status pages combine this with `useIntentStatus`
 *  for live updates over WebSocket. */
export function useIntent(intentHash: string | undefined) {
  return useQuery({
    queryKey: ['intent', intentHash],
    enabled: typeof intentHash === 'string' && intentHash.startsWith('0x') && intentHash.length === 66,
    queryFn: () => api.getIntent(intentHash as string),
    select: (data): IntentRecord => data.intent,
    refetchInterval: 5_000,
  });
}
