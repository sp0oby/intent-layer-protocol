/**
 * Thin client for the backend REST + WebSocket API. Pulls the base URL
 * from `NEXT_PUBLIC_API_BASE_URL` so the frontend can target a deployed
 * backend in production while still hitting localhost during dev.
 *
 * No retry/backoff here — TanStack Query handles that for queries; the
 * solver-proposal POST is idempotent on the contract side, so no retry
 * needed.
 */

import type {IntentRecord} from './types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ??
  API_BASE_URL.replace(/^http/, 'ws');

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {cache: 'no-store'});
  if (!res.ok) {
    throw new Error(`${path} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface ListIntentsResponse {
  intents: IntentRecord[];
}

export interface IntentResponse {
  intent: IntentRecord;
}

export const api = {
  listUnmatched: (chainId?: number): Promise<ListIntentsResponse> =>
    getJson(`/api/intents/unmatched${chainId ? `?chainId=${chainId}` : ''}`),

  listAuctioning: (chainId?: number): Promise<ListIntentsResponse> =>
    getJson(`/api/intents/auctioning${chainId ? `?chainId=${chainId}` : ''}`),

  getIntent: (intentHash: string): Promise<IntentResponse> =>
    getJson(`/api/intents/${intentHash}`),

  /** WebSocket URL for real-time intent events keyed by hash. The hook
   *  layer wraps this in a connection lifecycle. */
  intentEventsUrl: (intentHash: string): string =>
    `${WS_BASE_URL}/ws?intentHash=${intentHash}`,
};
