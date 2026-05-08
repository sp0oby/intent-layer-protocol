import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import request from 'supertest';
import {SigningKey, Wallet, getBytes} from 'ethers';
import {createApp, type ApiConfig} from '../src/server';
import type {OrderBookRepository} from '../src/db/repository';
import type {IntentRecord} from '../src/types/intent';
import {proposalDigest} from '../src/services/proposal-verifier';

vi.mock('../src/db/pool', () => ({
  healthcheckDb: vi.fn(async () => true),
  getPool: vi.fn(),
}));

const NOW = 1_730_000_000;
const ETH = 1;
const BASE = 8453;
const AUCTION_ETH = '0x1111111111111111111111111111111111111111';
const AUCTION_BASE = '0x2222222222222222222222222222222222222222';
const INTENT_HASH = '0x' + 'aa'.repeat(32);

const config: ApiConfig = {
  solverAuctionByChain: {[ETH]: AUCTION_ETH, [BASE]: AUCTION_BASE},
};

const intent = (overrides: Partial<IntentRecord> = {}): IntentRecord => ({
  intentHash: INTENT_HASH,
  user: '0xUserA',
  refundTo: '0x0000000000000000000000000000000000000000',
  sourceChainId: ETH,
  sourceToken: '0x0000000000000000000000000000000000000000',
  sourceAmount: '1000000000000000000',
  destChainId: BASE,
  destToken: '0xdddd000000000000000000000000000000000004',
  minDestAmount: '2400000000',
  deadline: NOW + 3600,
  nonce: '1',
  state: 'PENDING',
  ...overrides,
});

function makeRepo(rows: IntentRecord[]): OrderBookRepository {
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
    upsertProposal: vi.fn(async () => {
      /* no-op */
    }),
    markProposalWinner: noop,
    readCursor: vi.fn(async () => null),
    advanceCursor: noop,
    withTransaction: vi.fn(async <T>(fn: (client: never) => Promise<T>) => fn(undefined as never)),
    listMatchEligible: vi.fn(async (chainId: number) => rows.filter((r) => r.sourceChainId === chainId)),
    getIntent: vi.fn(async (hash: string) => rows.find((r) => r.intentHash === hash) ?? null),
    listEligibleForAuctionOpen: vi.fn(async () => []),
    listEligibleForAuctionFinalize: vi.fn(async () => []),
    listIntentsByUser: vi.fn(async (userAddr: string, limit: number, offset: number) => {
      const filtered = rows
        .filter((r) => r.user.toLowerCase() === userAddr.toLowerCase())
        .sort((a, b) => (b.submittedAtBlockTs ?? 0) - (a.submittedAtBlockTs ?? 0));
      return filtered.slice(offset, offset + limit);
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW * 1000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /health', () => {
  it('returns ok and the db probe result', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ok: true, database: true});
  });
});

describe('GET /api/intents/unmatched', () => {
  it('serializes match-eligible intents across all configured chains', async () => {
    const app = createApp({
      repo: makeRepo([
        intent({intentHash: '0x' + 'a'.repeat(64), sourceChainId: ETH}),
        intent({intentHash: '0x' + 'b'.repeat(64), sourceChainId: BASE, nonce: '2'}),
      ]),
      config,
    });
    const res = await request(app).get('/api/intents/unmatched');
    expect(res.status).toBe(200);
    expect(res.body.intents).toHaveLength(2);
    expect(res.body.intents[0]).toMatchObject({
      intentHash: '0x' + 'a'.repeat(64),
      sourceChainId: ETH,
      state: 'PENDING',
    });
  });

  it('respects ?chainId filter', async () => {
    const app = createApp({
      repo: makeRepo([
        intent({intentHash: '0x' + 'a'.repeat(64), sourceChainId: ETH}),
        intent({intentHash: '0x' + 'b'.repeat(64), sourceChainId: BASE, nonce: '2'}),
      ]),
      config,
    });
    const res = await request(app).get(`/api/intents/unmatched?chainId=${ETH}`);
    expect(res.status).toBe(200);
    expect(res.body.intents).toHaveLength(1);
    expect(res.body.intents[0].sourceChainId).toBe(ETH);
  });

  it('rejects bad chainId', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).get('/api/intents/unmatched?chainId=banana');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/intents/auctioning', () => {
  it('returns only AUCTIONING intents', async () => {
    const app = createApp({
      repo: makeRepo([
        intent({intentHash: '0x' + 'a'.repeat(64), state: 'PENDING'}),
        intent({intentHash: '0x' + 'b'.repeat(64), state: 'AUCTIONING', nonce: '2'}),
      ]),
      config,
    });
    const res = await request(app).get('/api/intents/auctioning');
    expect(res.status).toBe(200);
    expect(res.body.intents).toHaveLength(1);
    expect(res.body.intents[0].state).toBe('AUCTIONING');
  });
});

describe('GET /api/intents (history by user)', () => {
  // Use a real lowercase Ethereum address since the route validates the
  // 0x-prefixed 40-hex shape strictly.
  const USER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const OTHER = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';

  it('returns the user\'s intents newest-first', async () => {
    const rows = [
      intent({intentHash: '0x' + 'a'.repeat(64), user: USER, state: 'PENDING', submittedAtBlockTs: NOW - 60}),
      intent({intentHash: '0x' + 'b'.repeat(64), user: USER, state: 'SETTLED', submittedAtBlockTs: NOW - 600, nonce: '2'}),
      intent({intentHash: '0x' + 'c'.repeat(64), user: OTHER, state: 'PENDING', submittedAtBlockTs: NOW - 30, nonce: '3'}),
    ];
    const app = createApp({repo: makeRepo(rows), config});
    const res = await request(app).get(`/api/intents?user=${USER}`);
    expect(res.status).toBe(200);
    expect(res.body.intents.map((i: {intentHash: string}) => i.intentHash)).toEqual([
      '0x' + 'a'.repeat(64), // newer first
      '0x' + 'b'.repeat(64),
    ]);
    expect(res.body.hasMore).toBe(false);
  });

  it('400s when user is missing or malformed', async () => {
    const app = createApp({repo: makeRepo([]), config});
    expect((await request(app).get('/api/intents')).status).toBe(400);
    expect((await request(app).get('/api/intents?user=notahex')).status).toBe(400);
  });

  it('honours limit + offset and surfaces hasMore', async () => {
    const rows = Array.from({length: 25}).map((_, i) =>
      intent({
        intentHash: '0x' + i.toString(16).padStart(64, '0'),
        user: USER,
        nonce: String(i + 1),
        submittedAtBlockTs: NOW - i,
      })
    );
    const app = createApp({repo: makeRepo(rows), config});
    const first = await request(app).get(`/api/intents?user=${USER}&limit=10&offset=0`);
    expect(first.status).toBe(200);
    expect(first.body.intents).toHaveLength(10);
    expect(first.body.hasMore).toBe(true);

    const last = await request(app).get(`/api/intents?user=${USER}&limit=10&offset=20`);
    expect(last.body.intents).toHaveLength(5);
    expect(last.body.hasMore).toBe(false);
  });

  it('400s on out-of-range limit', async () => {
    const app = createApp({repo: makeRepo([]), config});
    expect((await request(app).get(`/api/intents?user=${USER}&limit=0`)).status).toBe(400);
    expect((await request(app).get(`/api/intents?user=${USER}&limit=999`)).status).toBe(400);
  });
});

describe('GET /api/intents/:hash', () => {
  it('returns the intent when found', async () => {
    const target = intent();
    const app = createApp({repo: makeRepo([target]), config});
    const res = await request(app).get(`/api/intents/${INTENT_HASH}`);
    expect(res.status).toBe(200);
    expect(res.body.intent.intentHash).toBe(INTENT_HASH);
  });

  it('404s on unknown hash', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).get(`/api/intents/${INTENT_HASH}`);
    expect(res.status).toBe(404);
  });

  it('400s on malformed hash', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).get('/api/intents/notahash');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/solver/proposals', () => {
  const wallet = new Wallet('0x' + '03'.repeat(32));

  const validBody = (overrides: Record<string, unknown> = {}) => {
    const inputs = {
      chainId: ETH,
      auctionAddress: AUCTION_ETH,
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    };
    const digest = proposalDigest(inputs);
    const sig = (wallet.signingKey as SigningKey).sign(getBytes(digest)).serialized;
    return {
      ...inputs,
      solver: wallet.address,
      signature: sig,
      ...overrides,
    };
  };

  it('accepts a valid proposal and persists it', async () => {
    const repo = makeRepo([]);
    const app = createApp({repo, config});
    const res = await request(app).post('/api/solver/proposals').send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(true);
    expect(repo.upsertProposal).toHaveBeenCalledTimes(1);
  });

  it('rejects when chainId has no configured auction', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).post('/api/solver/proposals').send(validBody({chainId: 137}));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no SolverAuction/);
  });

  it('rejects a tampered signature', async () => {
    const repo = makeRepo([]);
    const app = createApp({repo, config});
    const body = validBody();
    body.proposedOutputAmount = '9999999999'; // amount mismatches the signed digest
    const res = await request(app).post('/api/solver/proposals').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match/);
    expect(repo.upsertProposal).not.toHaveBeenCalled();
  });

  it('rejects a request missing required fields', async () => {
    const app = createApp({repo: makeRepo([]), config});
    const res = await request(app).post('/api/solver/proposals').send({intentHash: INTENT_HASH});
    expect(res.status).toBe(400);
  });
});
