import {describe, expect, it, vi} from 'vitest';
import {MatchingLoop, type MatchSubmitter} from '../src/services/matching-loop';
import type {OrderBookRepository} from '../src/db/repository';
import type {IntentRecord} from '../src/types/intent';

const NOW = 1_730_000_000;
const ETH = 1;
const BASE = 8453;
const ETH_TOKEN = '0x0000000000000000000000000000000000000000';
const USDC_TOKEN = '0xdddd000000000000000000000000000000000004';

const intent = (overrides: Partial<IntentRecord> = {}): IntentRecord => ({
  intentHash: '0x' + 'a'.repeat(64),
  user: '0xUserA',
  refundTo: '0x0000000000000000000000000000000000000000',
  sourceChainId: ETH,
  sourceToken: ETH_TOKEN,
  sourceAmount: '1000000000000000000',
  destChainId: BASE,
  destToken: USDC_TOKEN,
  minDestAmount: '2400000000',
  deadline: NOW + 3600,
  nonce: '1',
  state: 'PENDING',
  ...overrides,
});

const opposite = (overrides: Partial<IntentRecord> = {}): IntentRecord =>
  intent({
    intentHash: '0x' + 'b'.repeat(64),
    user: '0xUserB',
    sourceChainId: BASE,
    sourceToken: USDC_TOKEN,
    sourceAmount: '2400000000',
    destChainId: ETH,
    destToken: ETH_TOKEN,
    minDestAmount: '1000000000000000000',
    nonce: '2',
    ...overrides,
  });

function makeRepoWithPool(rows: IntentRecord[]): OrderBookRepository {
  const noop = vi.fn(async () => {
    /* no-op */
  });
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
    withTransaction: vi.fn(async <T>(fn: (client: never) => Promise<T>) => fn(undefined as never)),
    listMatchEligible: vi.fn(async (chainId: number) => rows.filter((r) => r.sourceChainId === chainId)),
    getIntent: vi.fn(async (hash: string) => rows.find((r) => r.intentHash === hash) ?? null),
    listEligibleForAuctionOpen: vi.fn(async () => []),
    listEligibleForAuctionFinalize: vi.fn(async () => []),
    listIntentsByUser: vi.fn(async () => []),
  };
}

const fakeClock = {now: () => NOW * 1000, sleep: () => Promise.resolve()};

describe('MatchingLoop.tick', () => {
  it('submits a match when a P2P pair exists', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(async () => ({
      txHash: '0xdead',
    }));
    const repo = makeRepoWithPool([intent(), opposite()]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock}
    );
    const result = await loop.tick();
    expect(result.matchesAttempted).toBe(1);
    expect(result.matchesSubmitted).toBe(1);
    expect(submitter).toHaveBeenCalledTimes(1);
    const call = submitter.mock.calls[0][0];
    // Lower hash wins → 0xaaa... is local.
    expect(call.localHash).toBe('0x' + 'a'.repeat(64));
    expect(call.remoteHash).toBe('0x' + 'b'.repeat(64));
    expect(call.sourceChainId).toBe(ETH);
  });

  it('does not match when only one side is in the pool', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>();
    const repo = makeRepoWithPool([intent()]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock}
    );
    const result = await loop.tick();
    expect(result.matchesAttempted).toBe(0);
    expect(submitter).not.toHaveBeenCalled();
  });

  it('does not double-match within one tick', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(async () => ({
      txHash: '0xdead',
    }));
    // Three intents on the Ethereum side, two on the Base side. Greedy
    // pairing should produce exactly 2 matches, not 3 (no double-claim).
    const aliceA = intent({intentHash: '0x' + 'a'.repeat(64)});
    const aliceB = intent({intentHash: '0x' + 'c'.repeat(64), nonce: '3'});
    const bobA = opposite({intentHash: '0x' + 'b'.repeat(64)});
    const bobB = opposite({intentHash: '0x' + 'd'.repeat(64), nonce: '4'});
    const carolA = intent({intentHash: '0x' + 'e'.repeat(64), nonce: '5'});
    const repo = makeRepoWithPool([aliceA, aliceB, bobA, bobB, carolA]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock}
    );
    const result = await loop.tick();
    expect(result.matchesAttempted).toBe(2);
    expect(result.matchesSubmitted).toBe(2);
  });

  it('skips price-incompatible pairs without invoking the submitter', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>();
    const tooLow = opposite({sourceAmount: '100000000'}); // far below alice's 2400 min
    const repo = makeRepoWithPool([intent(), tooLow]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock}
    );
    const result = await loop.tick();
    expect(result.matchesAttempted).toBe(0);
    expect(submitter).not.toHaveBeenCalled();
  });

  it('logs a warning when the submitter rejects', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(async () => ({
      error: 'insufficient lz fee',
    }));
    const warn = vi.fn();
    const repo = makeRepoWithPool([intent(), opposite()]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock, logger: {info: vi.fn(), warn, error: vi.fn()}}
    );
    const result = await loop.tick();
    expect(result.matchesAttempted).toBe(1);
    expect(result.matchesSubmitted).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'match submission rejected',
      expect.objectContaining({error: 'insufficient lz fee'})
    );
  });

  it('clears inFlight after a tick completes (success or rejection)', async () => {
    const submitter = vi.fn<Parameters<MatchSubmitter>, ReturnType<MatchSubmitter>>(async () => ({
      txHash: '0xdead',
    }));
    const repo = makeRepoWithPool([intent(), opposite()]);
    const loop = new MatchingLoop(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, submitter, clock: fakeClock}
    );
    await loop.tick();
    expect(loop.inFlightCount()).toBe(0);
  });
});
