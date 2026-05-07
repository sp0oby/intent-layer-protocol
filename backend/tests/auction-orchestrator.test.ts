import {describe, expect, it, vi} from 'vitest';
import {AuctionOrchestrator, type AuctionSubmitter} from '../src/services/auction-orchestrator';
import type {OrderBookRepository} from '../src/db/repository';
import type {IntentRecord} from '../src/types/intent';

const NOW = 1_730_000_000;
const ETH = 1;
const BASE = 8453;

const intent = (overrides: Partial<IntentRecord> = {}): IntentRecord => ({
  intentHash: '0x' + 'a'.repeat(64),
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
  submittedAtBlockTs: NOW - 60,
  ...overrides,
});

function makeRepo(opts: {toOpen?: IntentRecord[]; toFinalize?: IntentRecord[]} = {}): OrderBookRepository {
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
    listMatchEligible: vi.fn(async () => []),
    getIntent: vi.fn(async () => null),
    listEligibleForAuctionOpen: vi.fn(async (chainId: number) =>
      (opts.toOpen ?? []).filter((i) => i.sourceChainId === chainId)
    ),
    listEligibleForAuctionFinalize: vi.fn(async (chainId: number) =>
      (opts.toFinalize ?? []).filter((i) => i.sourceChainId === chainId)
    ),
  };
}

const fakeClock = {now: () => NOW * 1000, sleep: () => Promise.resolve()};

describe('AuctionOrchestrator.tick', () => {
  it('opens an auction for each eligible PENDING intent', async () => {
    const opener = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>(async () => ({txHash: '0xopen'}));
    const finalizer = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>();
    const eligible = [
      intent({intentHash: '0x' + 'a'.repeat(64), submittedAtBlockTs: NOW - 60}),
      intent({intentHash: '0x' + 'b'.repeat(64), submittedAtBlockTs: NOW - 45, nonce: '2'}),
    ];
    const repo = makeRepo({toOpen: eligible});
    const orch = new AuctionOrchestrator(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, openSubmitter: opener, finalizeSubmitter: finalizer, clock: fakeClock}
    );
    const result = await orch.tick();
    expect(result.opens).toBe(2);
    expect(opener).toHaveBeenCalledTimes(2);
    expect(finalizer).not.toHaveBeenCalled();
  });

  it('finalizes auctions whose deadline has passed', async () => {
    const opener = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>();
    const finalizer = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>(async () => ({
      txHash: '0xfin',
    }));
    const auctioning = [
      intent({
        intentHash: '0x' + 'c'.repeat(64),
        state: 'AUCTIONING',
        auctionDeadline: NOW - 5,
        nonce: '3',
      }),
    ];
    const repo = makeRepo({toFinalize: auctioning});
    const orch = new AuctionOrchestrator(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, openSubmitter: opener, finalizeSubmitter: finalizer, clock: fakeClock}
    );
    const result = await orch.tick();
    expect(result.finalizes).toBe(1);
    expect(finalizer).toHaveBeenCalledWith({sourceChainId: ETH, intentHash: '0x' + 'c'.repeat(64)});
  });

  it('treats {skipped} as info, not error', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const opener = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>(async () => ({
      skipped: 'no proposals yet',
    }));
    const finalizer = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>();
    const repo = makeRepo({toOpen: [intent()]});
    const orch = new AuctionOrchestrator(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {
        repo,
        openSubmitter: opener,
        finalizeSubmitter: finalizer,
        clock: fakeClock,
        logger: {info, warn, error: vi.fn()},
      }
    );
    const result = await orch.tick();
    expect(result.opens).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('auction open skipped', expect.objectContaining({reason: 'no proposals yet'}));
  });

  it('catches submitter exceptions without aborting the rest of the tick', async () => {
    const error = vi.fn();
    let callCount = 0;
    const opener = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>(async () => {
      callCount += 1;
      if (callCount === 1) throw new Error('rpc down');
      return {txHash: '0xok'};
    });
    const finalizer = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>();
    const repo = makeRepo({
      toOpen: [
        intent({intentHash: '0x' + 'a'.repeat(64)}),
        intent({intentHash: '0x' + 'b'.repeat(64), nonce: '2'}),
      ],
    });
    const orch = new AuctionOrchestrator(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {
        repo,
        openSubmitter: opener,
        finalizeSubmitter: finalizer,
        clock: fakeClock,
        logger: {info: vi.fn(), warn: vi.fn(), error},
      }
    );
    const result = await orch.tick();
    expect(result.opens).toBe(1);
    expect(error).toHaveBeenCalledWith('auction open threw', expect.objectContaining({error: 'rpc down'}));
  });

  it('clears inFlight after the tick', async () => {
    const opener = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>(async () => ({txHash: '0xok'}));
    const finalizer = vi.fn<Parameters<AuctionSubmitter>, ReturnType<AuctionSubmitter>>();
    const repo = makeRepo({toOpen: [intent()]});
    const orch = new AuctionOrchestrator(
      {sourceChainIds: [ETH, BASE], pollIntervalMs: 1000},
      {repo, openSubmitter: opener, finalizeSubmitter: finalizer, clock: fakeClock}
    );
    await orch.tick();
    expect(orch.inFlightCount()).toBe(0);
  });
});
