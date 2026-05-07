import {describe, expect, it, vi} from 'vitest';
import {publishingRepository} from '../src/db/publishing-repository';
import {createEventBus, type IntentEvent} from '../src/services/event-bus';
import type {OrderBookRepository} from '../src/db/repository';

const HASH_A = '0x' + 'a'.repeat(64);
const HASH_B = '0x' + 'b'.repeat(64);
const TX = '0x' + 'c'.repeat(64);

function makeInner(): OrderBookRepository {
  const ok = vi.fn(async () => {
    /* no-op */
  });
  return {
    insertIntent: ok,
    markMatched: ok,
    markCancelled: ok,
    markSettled: ok,
    markRefunded: ok,
    markAuctioning: ok,
    upsertProposal: ok,
    markProposalWinner: ok,
    readCursor: vi.fn(async () => null),
    advanceCursor: ok,
    withTransaction: vi.fn(async <T>(fn: (client: never) => Promise<T>) => fn(undefined as never)),
    listMatchEligible: vi.fn(async () => []),
    getIntent: vi.fn(async () => null),
    listEligibleForAuctionOpen: vi.fn(async () => []),
    listEligibleForAuctionFinalize: vi.fn(async () => []),
  };
}

describe('publishingRepository', () => {
  it('emits IntentSubmitted + StateChange on insertIntent', async () => {
    const events: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => events.push(e));
    const repo = publishingRepository(makeInner(), bus);
    await repo.insertIntent({
      intentHash: HASH_A,
      user: '0xUser',
      refundTo: '0x0',
      sourceChainId: 1,
      sourceToken: '0x0',
      sourceAmount: '1',
      destChainId: 8453,
      destToken: '0x0',
      minDestAmount: '1',
      deadline: 0,
      nonce: '1',
      submittedAtBlockTs: 0,
      submitTxHash: TX,
    });
    expect(events.map((e) => e.type)).toEqual(['IntentSubmitted', 'StateChange']);
    expect(events[1]).toMatchObject({newState: 'PENDING', txHash: TX});
  });

  it('emits StateChange on both sides of a match', async () => {
    const aEvents: IntentEvent[] = [];
    const bEvents: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => aEvents.push(e));
    bus.on(HASH_B, (e) => bEvents.push(e));
    const repo = publishingRepository(makeInner(), bus);
    await repo.markMatched({
      localHash: HASH_A,
      remoteHash: HASH_B,
      matchTimestamp: 0,
      sourceChainId: 1,
      destChainId: 8453,
      executeMatchTxHash: TX,
    });
    expect(aEvents).toHaveLength(1);
    expect(bEvents).toHaveLength(1);
    expect(aEvents[0]).toMatchObject({newState: 'MATCHED', txHash: TX});
  });

  it.each([
    ['markCancelled', 'CANCELLED'],
    ['markSettled', 'SETTLED'],
    ['markAuctioning', 'AUCTIONING'],
  ] as const)('emits StateChange %s -> %s', async (method, state) => {
    const events: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => events.push(e));
    const repo = publishingRepository(makeInner(), bus);
    if (method === 'markCancelled') {
      await repo.markCancelled({intentHash: HASH_A, cancelTxHash: TX});
    } else if (method === 'markSettled') {
      await repo.markSettled({intentHash: HASH_A, settleTxHash: TX, blockTimestamp: 0});
    } else {
      await repo.markAuctioning({intentHash: HASH_A, auctionDeadline: 100});
    }
    expect(events[0]).toMatchObject({type: 'StateChange', newState: state});
  });

  it('emits REFUNDED only when prior state was MATCHED (LZ-timeout path)', async () => {
    const events: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => events.push(e));
    const inner = makeInner();
    (inner.getIntent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      intentHash: HASH_A,
      state: 'MATCHED',
    });
    const repo = publishingRepository(inner, bus);
    await repo.markRefunded({intentHash: HASH_A, refundTxHash: TX, blockTimestamp: 0});
    expect(events[0]).toMatchObject({type: 'StateChange', newState: 'REFUNDED'});
  });

  it('does NOT emit REFUNDED when prior state was CANCELLED (cancel-path refund)', async () => {
    const events: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => events.push(e));
    const inner = makeInner();
    (inner.getIntent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      intentHash: HASH_A,
      state: 'CANCELLED',
    });
    const repo = publishingRepository(inner, bus);
    await repo.markRefunded({intentHash: HASH_A, refundTxHash: TX, blockTimestamp: 0});
    expect(events).toEqual([]);
  });

  it('does not emit if the underlying mutation throws', async () => {
    const events: IntentEvent[] = [];
    const bus = createEventBus();
    bus.on(HASH_A, (e) => events.push(e));
    const inner = makeInner();
    (inner.markCancelled as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const repo = publishingRepository(inner, bus);
    await expect(repo.markCancelled({intentHash: HASH_A, cancelTxHash: TX})).rejects.toThrow('db down');
    expect(events).toHaveLength(0);
  });
});
