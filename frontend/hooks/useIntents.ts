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
import type {IntentRecord, ProposalRecord} from '@/lib/types';

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

/** Live proposals for an intent. Status page uses this while the
 *  intent is in AUCTIONING so the user can watch solvers bid. Empty
 *  array is a valid response (unbid intent). */
export function useIntentProposals(intentHash: string | undefined) {
  return useQuery({
    queryKey: ['intent', intentHash, 'proposals'],
    enabled: typeof intentHash === 'string' && intentHash.startsWith('0x') && intentHash.length === 66,
    queryFn: () => api.getIntentProposals(intentHash as string),
    select: (data): ProposalRecord[] => data.proposals,
    refetchInterval: 3_000,
    staleTime: 1_500,
  });
}

/** Paginated history for one user. Disabled until a wallet connects.
 *  The /history page composes this with a Load-more button driven by the
 *  hasMore flag. */
export function useIntentHistory(
  userAddress: string | undefined,
  {limit = 20, offset = 0}: {limit?: number; offset?: number} = {}
) {
  return useQuery({
    queryKey: ['intents', 'by-user', userAddress?.toLowerCase(), limit, offset],
    enabled: typeof userAddress === 'string' && /^0x[0-9a-fA-F]{40}$/.test(userAddress),
    queryFn: () => api.listByUser(userAddress as string, {limit, offset}),
    refetchInterval: 7_500,
  });
}
