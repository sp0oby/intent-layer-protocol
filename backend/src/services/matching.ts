export type IntentRecord = {
  id: string;
  sourceChainId: number;
  destChainId: number;
  sourceToken: string;
  destToken: string;
  sourceAmount: string;
  minDestAmount: string;
  user: string;
  state: 'PENDING' | 'MATCHED' | 'SETTLED' | 'CANCELLED';
};

/**
 * Minimal opposite-intent matcher (MVP pseudocode — in-memory only).
 */
export function findOppositeIntent(target: IntentRecord, book: IntentRecord[]): IntentRecord | undefined {
  const candidates = book.filter(
    (i) =>
      i.state === 'PENDING' &&
      i.sourceChainId === target.destChainId &&
      i.destChainId === target.sourceChainId &&
      i.sourceToken.toLowerCase() === target.destToken.toLowerCase() &&
      i.destToken.toLowerCase() === target.sourceToken.toLowerCase(),
  );

  for (const candidate of candidates) {
    const priceOk =
      BigInt(target.sourceAmount) >= BigInt(candidate.minDestAmount) &&
      BigInt(candidate.sourceAmount) >= BigInt(target.minDestAmount);
    if (priceOk) {
      return candidate;
    }
  }
  return undefined;
}

export class InMemoryOrderBook {
  private readonly intents = new Map<string, IntentRecord>();

  upsert(intent: IntentRecord): void {
    this.intents.set(intent.id, intent);
  }

  listUnmatched(): IntentRecord[] {
    return [...this.intents.values()].filter((i) => i.state === 'PENDING');
  }
}
