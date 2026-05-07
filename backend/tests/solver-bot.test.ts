import {describe, expect, it, vi, beforeEach} from 'vitest';
import {Wallet, type Signer} from 'ethers';
import {SolverBot} from '../src/bot/solver-bot';

const HASH_A = '0x' + 'a'.repeat(64);
const AUCTION = '0x' + '11'.repeat(20);
const ETH = 1;

const submitProposalMock = vi.hoisted(() => vi.fn());

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({
      submitProposal: submitProposalMock,
    })),
  };
});

const fakeReceipt = (hash: string) => ({hash});

const fakeClock = {now: () => 1_700_000_000_000, sleep: () => Promise.resolve()};

let wallet: Wallet;

beforeEach(() => {
  wallet = new Wallet('0x' + '03'.repeat(32));
  submitProposalMock.mockReset();
});

const auctioningIntent = (overrides: Record<string, unknown> = {}) => ({
  intentHash: HASH_A,
  sourceChainId: ETH,
  destChainId: 8453,
  sourceAmount: '1000000000000000000',
  minDestAmount: '2400000000',
  ...overrides,
});

const fakeFetch = (intents: unknown[], postOk = true) => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({url: url.toString(), init});
    if (url.toString().endsWith('/api/intents/auctioning')) {
      return new Response(JSON.stringify({intents}), {status: 200});
    }
    if (url.toString().endsWith('/api/solver/proposals')) {
      return new Response(JSON.stringify({accepted: postOk}), {status: postOk ? 201 : 400});
    }
    return new Response('not found', {status: 404});
  });
  return {fetchImpl, calls};
};

describe('SolverBot.tick', () => {
  it('signs, posts, and on-chain-submits a proposal for each new auctioning intent', async () => {
    submitProposalMock.mockResolvedValue({hash: '0xfeed', wait: async () => fakeReceipt('0xfeed')});
    const {fetchImpl, calls} = fakeFetch([auctioningIntent()]);
    const bot = new SolverBot(
      {
        apiBaseUrl: 'http://localhost:4000',
        solverAuctionByChain: {[ETH]: AUCTION},
        markupBps: 50,
        feeBps: 30,
        pollIntervalMs: 1000,
      },
      {
        signersByChain: {[ETH]: wallet as unknown as Signer},
        fetch: fetchImpl as unknown as typeof fetch,
        clock: fakeClock,
      }
    );
    const result = await bot.tick();
    expect(result.bidsSubmitted).toBe(1);
    expect(submitProposalMock).toHaveBeenCalledTimes(1);
    const [intentHash, output, fee, sig] = submitProposalMock.mock.calls[0];
    expect(intentHash).toBe(HASH_A);
    // 2400e6 + 0.5% = 2412e6
    expect(output).toBe('2412000000');
    expect(fee).toBe(30);
    expect(sig).toMatch(/^0x[0-9a-f]+$/);
    // POST to /api/solver/proposals
    expect(calls.some((c) => c.url.endsWith('/api/solver/proposals') && c.init?.method === 'POST')).toBe(true);
  });

  it('does not re-bid the same intent across two ticks', async () => {
    submitProposalMock.mockResolvedValue({hash: '0xfeed', wait: async () => fakeReceipt('0xfeed')});
    const {fetchImpl} = fakeFetch([auctioningIntent()]);
    const bot = new SolverBot(
      {
        apiBaseUrl: 'http://localhost:4000',
        solverAuctionByChain: {[ETH]: AUCTION},
        markupBps: 50,
        feeBps: 30,
        pollIntervalMs: 1000,
      },
      {
        signersByChain: {[ETH]: wallet as unknown as Signer},
        fetch: fetchImpl as unknown as typeof fetch,
        clock: fakeClock,
      }
    );
    await bot.tick();
    const second = await bot.tick();
    expect(second.bidsSubmitted).toBe(0);
    expect(submitProposalMock).toHaveBeenCalledTimes(1);
  });

  it('skips intents on chains without configured auction or signer', async () => {
    const {fetchImpl} = fakeFetch([auctioningIntent({sourceChainId: 137})]);
    const warn = vi.fn();
    const bot = new SolverBot(
      {
        apiBaseUrl: 'http://localhost:4000',
        solverAuctionByChain: {[ETH]: AUCTION}, // no entry for chain 137
        markupBps: 50,
        feeBps: 30,
        pollIntervalMs: 1000,
      },
      {
        signersByChain: {[ETH]: wallet as unknown as Signer},
        fetch: fetchImpl as unknown as typeof fetch,
        clock: fakeClock,
        logger: {info: vi.fn(), warn, error: vi.fn()},
      }
    );
    const result = await bot.tick();
    expect(result.bidsSubmitted).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'skipping intent — no auction address for chain',
      expect.objectContaining({chainId: 137})
    );
    expect(submitProposalMock).not.toHaveBeenCalled();
  });

  it('logs and continues when the API rejects the proposal', async () => {
    submitProposalMock.mockResolvedValue({hash: '0xfeed', wait: async () => fakeReceipt('0xfeed')});
    const {fetchImpl} = fakeFetch([auctioningIntent()], false);
    const warn = vi.fn();
    const bot = new SolverBot(
      {
        apiBaseUrl: 'http://localhost:4000',
        solverAuctionByChain: {[ETH]: AUCTION},
        markupBps: 50,
        feeBps: 30,
        pollIntervalMs: 1000,
      },
      {
        signersByChain: {[ETH]: wallet as unknown as Signer},
        fetch: fetchImpl as unknown as typeof fetch,
        clock: fakeClock,
        logger: {info: vi.fn(), warn, error: vi.fn()},
      }
    );
    const result = await bot.tick();
    expect(result.bidsSubmitted).toBe(0);
    expect(warn).toHaveBeenCalledWith('api rejected proposal', expect.objectContaining({status: 400}));
    expect(submitProposalMock).not.toHaveBeenCalled();
  });

  it('handles on-chain submit failure without losing the seen marker', async () => {
    submitProposalMock.mockRejectedValueOnce(new Error('rpc down'));
    const {fetchImpl} = fakeFetch([auctioningIntent()]);
    const warn = vi.fn();
    const bot = new SolverBot(
      {
        apiBaseUrl: 'http://localhost:4000',
        solverAuctionByChain: {[ETH]: AUCTION},
        markupBps: 50,
        feeBps: 30,
        pollIntervalMs: 1000,
      },
      {
        signersByChain: {[ETH]: wallet as unknown as Signer},
        fetch: fetchImpl as unknown as typeof fetch,
        clock: fakeClock,
        logger: {info: vi.fn(), warn, error: vi.fn()},
      }
    );
    const result = await bot.tick();
    expect(result.bidsSubmitted).toBe(0);
    expect(warn).toHaveBeenCalledWith('on-chain submit failed', expect.objectContaining({error: expect.stringMatching(/rpc down/)}));
    // The bot retries on the next tick (seen NOT set), the contract's
    // AlreadySubmitted guard would catch genuine duplicates.
  });
});
