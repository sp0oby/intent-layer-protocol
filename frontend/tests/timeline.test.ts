import {describe, expect, it} from 'vitest';
import {buildSteps} from '@/lib/timeline';
import type {IntentState} from '@/lib/types';

describe('buildSteps', () => {
  it('PENDING → Submitted past, Matching active, Settled future', () => {
    const steps = buildSteps('PENDING');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({key: 'submitted', status: 'past'});
    expect(steps[1]).toMatchObject({key: 'matched', status: 'active'});
    expect(steps[2]).toMatchObject({key: 'settled', status: 'future'});
    expect(steps[0].offPath).toBeUndefined();
  });

  it('AUCTIONING reuses the matched slot with auction-specific copy', () => {
    const steps = buildSteps('AUCTIONING');
    expect(steps).toHaveLength(3);
    expect(steps[1].key).toBe('matched');
    expect(steps[1].label).toMatch(/auction/i);
    expect(steps[1].status).toBe('active');
  });

  it('MATCHED → Settled is the active step', () => {
    const steps = buildSteps('MATCHED');
    expect(steps[0].status).toBe('past');
    expect(steps[1].status).toBe('past');
    expect(steps[2]).toMatchObject({key: 'settled', status: 'active'});
  });

  it('LOCKED is treated like MATCHED (Phase 2B reservation)', () => {
    const steps = buildSteps('LOCKED');
    expect(steps[2]).toMatchObject({key: 'settled', status: 'active'});
  });

  it('SETTLED → every step past, no active', () => {
    const steps = buildSteps('SETTLED');
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.status === 'past')).toBe(true);
  });

  it('CANCELLED → off-path terminal node after Submitted', () => {
    const steps = buildSteps('CANCELLED');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({key: 'submitted', status: 'past'});
    expect(steps[1]).toMatchObject({key: 'cancelled', status: 'active', offPath: true});
  });

  it('REFUNDED → matched then off-path Refunded with LZ-timeout description', () => {
    const steps = buildSteps('REFUNDED');
    expect(steps).toHaveLength(3);
    expect(steps[0].status).toBe('past');
    expect(steps[1]).toMatchObject({key: 'matched', status: 'past'});
    expect(steps[2]).toMatchObject({
      key: 'refunded',
      status: 'active',
      offPath: true,
    });
    expect(steps[2].description).toMatch(/layerzero/i);
  });

  it('every state in the IntentState union returns at least one step', () => {
    const allStates: IntentState[] = [
      'PENDING',
      'MATCHED',
      'AUCTIONING',
      'LOCKED',
      'SETTLED',
      'CANCELLED',
      'REFUNDED',
    ];
    for (const state of allStates) {
      const steps = buildSteps(state);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].key).toBe('submitted');
    }
  });
});
