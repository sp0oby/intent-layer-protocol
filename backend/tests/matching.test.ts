import {describe, expect, it} from 'vitest';
import {findOppositeIntent, type IntentRecord, InMemoryOrderBook} from '../src/services/matching';

const NOW = 1_730_000_000;

const baseIntent = (overrides: Partial<IntentRecord> = {}): IntentRecord => ({
  intentHash: '0x' + 'a'.repeat(64),
  user: '0xUserA',
  refundTo: '0x0000000000000000000000000000000000000000',
  sourceChainId: 1,
  sourceToken: '0xeeee000000000000000000000000000000000000',
  sourceAmount: '1000000000000000000',
  destChainId: 8453,
  destToken: '0xdddd000000000000000000000000000000000000',
  minDestAmount: '2400000000',
  deadline: NOW + 3600,
  nonce: '1',
  state: 'PENDING',
  ...overrides,
});

const opposite = (overrides: Partial<IntentRecord> = {}): IntentRecord =>
  baseIntent({
    intentHash: '0x' + 'b'.repeat(64),
    user: '0xUserB',
    sourceChainId: 8453,
    sourceToken: '0xdddd000000000000000000000000000000000000',
    sourceAmount: '2400000000',
    destChainId: 1,
    destToken: '0xeeee000000000000000000000000000000000000',
    minDestAmount: '1000000000000000000',
    nonce: '2',
    ...overrides,
  });

describe('findOppositeIntent', () => {
  it('matches when chains, tokens, and both minimums are satisfied', () => {
    const target = baseIntent();
    const match = findOppositeIntent(target, [opposite()], NOW);
    expect(match?.intentHash).toBe('0x' + 'b'.repeat(64));
  });

  it('does not return the target itself when it appears in the book', () => {
    const target = baseIntent();
    expect(findOppositeIntent(target, [target], NOW)).toBeUndefined();
  });

  it('rejects a candidate whose deadline has passed', () => {
    const target = baseIntent();
    const stale = opposite({deadline: NOW - 1});
    expect(findOppositeIntent(target, [stale], NOW)).toBeUndefined();
  });

  it('rejects when the target itself is expired', () => {
    const expiredTarget = baseIntent({deadline: NOW - 1});
    expect(findOppositeIntent(expiredTarget, [opposite()], NOW)).toBeUndefined();
  });

  it('rejects when the candidate offers less than the target minimum', () => {
    // target wants 2400 USDC min; candidate only offers 100 USDC.
    const target = baseIntent();
    const undercut = opposite({sourceAmount: '100000000'});
    expect(findOppositeIntent(target, [undercut], NOW)).toBeUndefined();
  });

  it('rejects when the target offers less than the candidate minimum', () => {
    // candidate wants 1 ETH min; target only offers 0.5 ETH.
    const target = baseIntent({sourceAmount: '500000000000000000'});
    expect(findOppositeIntent(target, [opposite()], NOW)).toBeUndefined();
  });

  it('matches Auctioning intents (auctioning intents stay eligible for P2P)', () => {
    const target = baseIntent({state: 'AUCTIONING'});
    const match = findOppositeIntent(target, [opposite()], NOW);
    expect(match?.intentHash).toBe('0x' + 'b'.repeat(64));
  });

  it('matches a Pending against an Auctioning counterparty', () => {
    const target = baseIntent();
    const auctioning = opposite({state: 'AUCTIONING'});
    const match = findOppositeIntent(target, [auctioning], NOW);
    expect(match?.intentHash).toBe(auctioning.intentHash);
  });

  it('skips terminal-state candidates', () => {
    const target = baseIntent();
    const candidates = (['MATCHED', 'LOCKED', 'SETTLED', 'CANCELLED', 'REFUNDED'] as const).map(
      (state) => opposite({intentHash: '0x' + state.padEnd(64, '0'), state})
    );
    expect(findOppositeIntent(target, candidates, NOW)).toBeUndefined();
  });

  it('rejects mismatched chain pair', () => {
    const target = baseIntent();
    const wrongChain = opposite({sourceChainId: 137});
    expect(findOppositeIntent(target, [wrongChain], NOW)).toBeUndefined();
  });

  it('rejects mismatched token pair', () => {
    const target = baseIntent();
    const wrongToken = opposite({sourceToken: '0xc0c0000000000000000000000000000000000000'});
    expect(findOppositeIntent(target, [wrongToken], NOW)).toBeUndefined();
  });

  it('matches addresses regardless of input casing', () => {
    const target = baseIntent({sourceToken: '0xEEEE000000000000000000000000000000000000'});
    const match = findOppositeIntent(target, [opposite()], NOW);
    expect(match).toBeDefined();
  });
});

describe('InMemoryOrderBook', () => {
  it('lists only match-eligible intents', () => {
    const book = new InMemoryOrderBook();
    book.upsert(baseIntent({intentHash: '0x' + '1'.repeat(64), state: 'PENDING'}));
    book.upsert(baseIntent({intentHash: '0x' + '2'.repeat(64), state: 'AUCTIONING'}));
    book.upsert(baseIntent({intentHash: '0x' + '3'.repeat(64), state: 'SETTLED'}));
    book.upsert(baseIntent({intentHash: '0x' + '4'.repeat(64), state: 'CANCELLED'}));

    const unmatched = book.listUnmatched(NOW);
    expect(unmatched.map((intent) => intent.state).sort()).toEqual(['AUCTIONING', 'PENDING']);
  });

  it('omits expired intents from listUnmatched', () => {
    const book = new InMemoryOrderBook();
    book.upsert(baseIntent({intentHash: '0x' + '5'.repeat(64), deadline: NOW - 1}));
    expect(book.listUnmatched(NOW)).toHaveLength(0);
  });

  it('returns undefined for unknown intent hash', () => {
    const book = new InMemoryOrderBook();
    expect(book.get('0xdeadbeef')).toBeUndefined();
  });
});
