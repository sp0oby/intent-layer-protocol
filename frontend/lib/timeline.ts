/**
 * State-machine display logic. Pure mapping from IntentState → ordered
 * step list. Lives outside the component so it can be unit-tested
 * without rendering React.
 */

import type {IntentState} from './types';

export type StepStatus = 'past' | 'active' | 'future';
export type StepKey = 'submitted' | 'matched' | 'settled' | 'cancelled' | 'refunded';

export interface Step {
  key: StepKey;
  label: string;
  description?: string;
  status: StepStatus;
  /** Off-path nodes (cancelled / refunded) render with an X icon
   *  instead of the standard check. */
  offPath?: boolean;
}

export function buildSteps(state: IntentState): Step[] {
  if (state === 'CANCELLED') {
    return [
      {key: 'submitted', label: 'Submitted', status: 'past'},
      {key: 'cancelled', label: 'Cancelled', status: 'active', offPath: true},
    ];
  }
  if (state === 'REFUNDED') {
    return [
      {key: 'submitted', label: 'Submitted', status: 'past'},
      {key: 'matched', label: 'Matched', status: 'past'},
      {
        key: 'refunded',
        label: 'Refunded',
        description: 'LayerZero timeout',
        status: 'active',
        offPath: true,
      },
    ];
  }
  if (state === 'PENDING') {
    return [
      {key: 'submitted', label: 'Submitted', status: 'past'},
      {key: 'matched', label: 'Matching…', description: 'Looking for a counterparty', status: 'active'},
      {key: 'settled', label: 'Settled', status: 'future'},
    ];
  }
  if (state === 'AUCTIONING') {
    return [
      {key: 'submitted', label: 'Submitted', status: 'past'},
      {
        key: 'matched',
        label: 'Auction open',
        description: 'Solvers competing to fill',
        status: 'active',
      },
      {key: 'settled', label: 'Settled', status: 'future'},
    ];
  }
  if (state === 'MATCHED' || state === 'LOCKED') {
    return [
      {key: 'submitted', label: 'Submitted', status: 'past'},
      {key: 'matched', label: 'Matched', status: 'past'},
      {key: 'settled', label: 'Settling…', description: 'Cross-chain delivery in flight', status: 'active'},
    ];
  }
  // SETTLED
  return [
    {key: 'submitted', label: 'Submitted', status: 'past'},
    {key: 'matched', label: 'Matched', status: 'past'},
    {key: 'settled', label: 'Settled', status: 'past'},
  ];
}
