import {describe, expect, it} from 'vitest';
import {findOppositeIntent, type IntentRecord, InMemoryOrderBook} from '../src/services/matching';

const baseIntent = (overrides: Partial<IntentRecord> = {}): IntentRecord => ({
  id: 'a',
  sourceChainId: 1,
  destChainId: 8453,
  sourceToken: '0xeth',
  destToken: '0xusdc',
  sourceAmount: '1',
  minDestAmount: '1',
  user: '0xuserA',
  state: 'PENDING',
  ...overrides,
});

describe('matching engine', () => {
  it('finds opposite intents when price constraints hold', () => {
    const target = baseIntent({id: 't'});
    const opposite = baseIntent({
      id: 'o',
      sourceChainId: 8453,
      destChainId: 1,
      sourceToken: '0xusdc',
      destToken: '0xeth',
      sourceAmount: '2',
      minDestAmount: '1',
    });
    const match = findOppositeIntent(target, [opposite]);
    expect(match?.id).toBe('o');
  });

  it('returns empty book for InMemoryOrderBook', () => {
    const book = new InMemoryOrderBook();
    expect(book.listUnmatched()).toHaveLength(0);
  });
});
