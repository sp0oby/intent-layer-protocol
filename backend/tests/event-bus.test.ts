import {describe, expect, it, vi} from 'vitest';
import {createEventBus, type IntentEvent} from '../src/services/event-bus';

const HASH_A = '0x' + 'a'.repeat(64);
const HASH_B = '0x' + 'b'.repeat(64);

describe('IntentEventBus', () => {
  it('delivers events to listeners subscribed to that hash', () => {
    const bus = createEventBus();
    const events: IntentEvent[] = [];
    bus.on(HASH_A, (e) => events.push(e));
    bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'PENDING', txHash: '0x1'});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({type: 'StateChange', newState: 'PENDING'});
  });

  it('does not deliver across hashes', () => {
    const bus = createEventBus();
    const aEvents: IntentEvent[] = [];
    const bEvents: IntentEvent[] = [];
    bus.on(HASH_A, (e) => aEvents.push(e));
    bus.on(HASH_B, (e) => bEvents.push(e));
    bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'MATCHED'});
    expect(aEvents).toHaveLength(1);
    expect(bEvents).toHaveLength(0);
  });

  it('matches case-insensitively (subscriber casing should not matter)', () => {
    const bus = createEventBus();
    const events: IntentEvent[] = [];
    bus.on(HASH_A.toUpperCase(), (e) => events.push(e));
    bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'SETTLED'});
    expect(events).toHaveLength(1);
  });

  it('unsubscribe removes the listener', () => {
    const bus = createEventBus();
    const events: IntentEvent[] = [];
    const off = bus.on(HASH_A, (e) => events.push(e));
    off();
    bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'CANCELLED'});
    expect(events).toHaveLength(0);
    expect(bus.listenerCount(HASH_A)).toBe(0);
  });

  it('listener exception does not break sibling listeners', () => {
    const bus = createEventBus();
    const seen = vi.fn();
    bus.on(HASH_A, () => {
      throw new Error('boom');
    });
    bus.on(HASH_A, seen);
    bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'MATCHED'});
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
