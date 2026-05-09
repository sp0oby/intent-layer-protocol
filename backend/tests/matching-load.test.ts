/**
 * Load test: matching engine with 100 concurrent intents.
 *
 * Target from docs/TIMELINE_CHECKLIST.md Stage 6:
 *   - 100 concurrent intents processed in a single tick
 *   - Matching latency < 5 000 ms
 *   - All 50 valid pairs matched exactly once (no double-match, no miss)
 *   - Price-incompatible and expired intents correctly skipped
 *
 * This is a pure unit test (mocked submitter, in-process repo). It
 * exercises the O(n²) findOppositeIntent scan at scale without requiring
 * Anvil or network I/O — network latency is covered by the E2E suite.
 */

import {describe, expect, it, vi} from 'vitest';
import {MatchingLoop, type MatchSubmitter} from '../src/services/matching-loop';
import type {OrderBookRepository} from '../src/db/repository';
import type {IntentRecord} from '../src/types/intent';

const NOW_SEC = 1_730_000_000;
const ETH_CHAIN = 1;
const BASE_CHAIN = 8453;
const ETH_TOKEN = '0x0000000000000000000000000000000000000000';
const USDC_TOKEN = '0xdddd000000000000000000000000000000000004';

const fakeClock = {
  now: () => NOW_SEC * 1_000,
  sleep: (): Promise<void> => Promise.resolve(),
};

function ethHash(i: number): string {
  // 0xaa + 62 hex chars = 66 total (valid 32-byte hash). 'aa' prefix
  // distinguishes ETH-side from BASE-side; index fills the rest.
  return '0xaa' + i.toString(16).padStart(62, '0');
}

function baseHash(i: number): string {
  return '0xbb' + i.toString(16).padStart(62, '0');
}

function makeEthIntent(i: number): IntentRecord {
  return {
    intentHash: ethHash(i),
    user: `0xUser${i}`,
    refundTo: '0x0000000000000000000000000000000000000000',
    sourceChainId: ETH_CHAIN,
    sourceToken: ETH_TOKEN,
    sourceAmount: '1000000000000000000', // 1 ETH
    destChainId: BASE_CHAIN,
    destToken: USDC_TOKEN,
    minDestAmount: '2400000000', // 2400 USDC
    deadline: NOW_SEC + 3600,
    nonce: String(i),
    state: 'PENDING',
  };
}

function makeBaseIntent(i: number): IntentRecord {
  return {
    intentHash: baseHash(i),
    user: `0xUser${i + 1000}`,
    refundTo: '0x0000000000000000000000000000000000000000',
    sourceChainId: BASE_CHAIN,
    sourceToken: USDC_TOKEN,
    sourceAmount: '2400000000', // 2400 USDC
    destChainId: ETH_CHAIN,
    destToken: ETH_TOKEN,
    minDestAmount: '1000000000000000000', // 1 ETH
    deadline: NOW_SEC + 3600,
    nonce: String(i + 1000),
    state: 'PENDING',
  };
}

function makeRepo(rows: IntentRecord[]): OrderBookRepository {
  const noop = vi.fn(async () => {});
  return {
    insertIntent: noop,
    markMatched: noop,
    markCancelled: noop,
    markSettled: noop,
    markRefunded: noop,
    markAuctioning: noop,
    upsertProposal: noop,
    markProposalWinner: noop,
    readCursor: vi.fn(async () => null),
    advanceCursor: noop,
    withTransaction: vi.fn(async <T>(fn: (c: never) => Promise<T>) => fn(undefined as never)),
    listMatchEligible: vi.fn(async (chainId: number) =>
      rows.filter((r) => r.sourceChainId === chainId)
    ),
    getIntent: vi.fn(async (hash) => rows.find((r) => r.intentHash === hash) ?? null),
    listEligibleForAuctionOpen: vi.fn(async () => []),
    listEligibleForAuctionFinalize: vi.fn(async () => []),
    listIntentsByUser: vi.fn(async () => []),
    listProposalsByIntent: vi.fn(async () => []),
  };
}

describe('MatchingLoop load — 100 concurrent intents', () => {
  const PAIR_COUNT = 50; // 50 ETH-side + 50 BASE-side = 100 total

  it('matches all 50 pairs in one tick and completes in < 5 000 ms', async () => {
    const ethIntents = Array.from({length: PAIR_COUNT}, (_, i) => makeEthIntent(i));
    const baseIntents = Array.from({length: PAIR_COUNT}, (_, i) => makeBaseIntent(i));
    const allIntents = [...ethIntents, ...baseIntents];

    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(
      async () => ({txHash: '0xload'})
    );
    const repo = makeRepo(allIntents);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH_CHAIN, BASE_CHAIN], pollIntervalMs: 5000},
      {repo, submitter, clock: fakeClock}
    );

    const start = Date.now();
    const result = await loop.tick();
    const elapsed = Date.now() - start;

    expect(result.matchesAttempted).toBe(PAIR_COUNT);
    expect(result.matchesSubmitted).toBe(PAIR_COUNT);
    expect(submitter).toHaveBeenCalledTimes(PAIR_COUNT);
    expect(elapsed).toBeLessThan(5_000);
  });

  it('produces no double-matches: each intent appears in at most one submitted pair', async () => {
    const ethIntents = Array.from({length: PAIR_COUNT}, (_, i) => makeEthIntent(i));
    const baseIntents = Array.from({length: PAIR_COUNT}, (_, i) => makeBaseIntent(i));

    const seenHashes = new Set<string>();
    const doubleMatched: string[] = [];

    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(
      async ({localHash, remoteHash}) => {
        for (const h of [localHash, remoteHash]) {
          if (seenHashes.has(h)) doubleMatched.push(h);
          seenHashes.add(h);
        }
        return {txHash: '0xload'};
      }
    );

    const repo = makeRepo([...ethIntents, ...baseIntents]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH_CHAIN, BASE_CHAIN], pollIntervalMs: 5000},
      {repo, submitter, clock: fakeClock}
    );

    await loop.tick();

    expect(doubleMatched).toHaveLength(0);
    expect(seenHashes.size).toBe(PAIR_COUNT * 2); // every intent matched exactly once
  });

  it('skips expired intents and only matches the valid remainder', async () => {
    const EXPIRED = 20;
    const VALID = 30;

    // First 20 ETH-side intents are expired; last 30 are valid.
    const ethIntents = Array.from({length: EXPIRED + VALID}, (_, i) =>
      makeEthIntent(i)
    ).map((intent, i) => ({
      ...intent,
      deadline: i < EXPIRED ? NOW_SEC - 1 : NOW_SEC + 3600,
    }));
    const baseIntents = Array.from({length: VALID}, (_, i) => makeBaseIntent(i));

    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(
      async () => ({txHash: '0xload'})
    );
    const repo = makeRepo([...ethIntents, ...baseIntents]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH_CHAIN, BASE_CHAIN], pollIntervalMs: 5000},
      {repo, submitter, clock: fakeClock}
    );

    const result = await loop.tick();

    expect(result.matchesAttempted).toBe(VALID);
    expect(result.matchesSubmitted).toBe(VALID);
  });

  it('skips price-incompatible intents even in a large pool', async () => {
    const GOOD_PAIRS = 25;
    const BAD_COUNT = 25; // ETH-side intents with minDestAmount higher than any BASE counterparty

    const goodEth = Array.from({length: GOOD_PAIRS}, (_, i) => makeEthIntent(i));
    const goodBase = Array.from({length: GOOD_PAIRS}, (_, i) => makeBaseIntent(i));
    // Bad intents want 99 999 USDC — no counterparty can satisfy this.
    const badEth = Array.from({length: BAD_COUNT}, (_, i) =>
      makeEthIntent(i + 100)
    ).map((intent) => ({...intent, minDestAmount: '99999000000'}));

    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(
      async () => ({txHash: '0xload'})
    );
    const repo = makeRepo([...goodEth, ...badEth, ...goodBase]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH_CHAIN, BASE_CHAIN], pollIntervalMs: 5000},
      {repo, submitter, clock: fakeClock}
    );

    const result = await loop.tick();

    expect(result.matchesAttempted).toBe(GOOD_PAIRS);
    expect(result.matchesSubmitted).toBe(GOOD_PAIRS);
  });
});
