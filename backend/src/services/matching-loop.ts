/**
 * DB-backed matching loop. Replaces the InMemoryOrderBook with periodic
 * polling of `intents` for match-eligible rows on a given source chain,
 * runs the same `findOppositeIntent` algorithm, and on a hit dispatches
 * `executeMatching` via an injected submitter.
 *
 * Trust boundary (per docs/STAGE_3_FINAL_REVIEW.md R-16):
 *   the matcher's filter is an EFFICIENCY optimisation. The destination
 *   contract independently re-validates token / chain / both-sides
 *   minimums against authoritative payload data. A buggy matcher cannot
 *   bypass either user's signed minDestAmount or destToken — at worst it
 *   submits a doomed executeMatching tx that costs the relayer gas, and
 *   the source intent recovers via refundIfLzTimeout.
 *
 * Concurrency:
 *   - Process-local `inFlight` Set prevents the loop from reusing the
 *     same intent within one tick or across rapid ticks before the
 *     indexer has written the resulting state change.
 *   - Multiple matcher instances pointed at one DB will race on-chain;
 *     only one tx wins and the loser reverts (gas waste only). Production
 *     deployment runs a single matcher instance per chain.
 */

import {findOppositeIntent} from './matching.js';
import type {IntentRecord} from '../types/intent.js';
import type {OrderBookRepository} from '../db/repository.js';

export type MatchSubmitter = (input: {
  sourceChainId: number;
  localHash: string;
  remoteHash: string;
}) => Promise<{txHash: string} | {error: string}>;

export interface MatchingLoopConfig {
  /** Source chains the loop polls. The loop pairs an intent on chain
   *  `sourceChainId` with a counterparty whose `sourceChainId === intent.destChainId`.
   *  Both directions are polled so Eth↔Base is covered by listing both. */
  sourceChainIds: number[];
  /** Milliseconds between poll cycles. */
  pollIntervalMs: number;
}

export interface MatchingLoopDependencies {
  repo: OrderBookRepository;
  submitter: MatchSubmitter;
  clock?: {now: () => number; sleep: (ms: number) => Promise<void>};
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

const defaultClock = {
  now: () => Date.now(),
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

const defaultLogger = {
  info: (msg: string, meta?: Record<string, unknown>): void => console.info(`[matcher] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>): void => console.warn(`[matcher] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>): void => console.error(`[matcher] ${msg}`, meta ?? ''),
};

export class MatchingLoop {
  private readonly config: MatchingLoopConfig;
  private readonly repo: OrderBookRepository;
  private readonly submitter: MatchSubmitter;
  private readonly clock: NonNullable<MatchingLoopDependencies['clock']>;
  private readonly logger: NonNullable<MatchingLoopDependencies['logger']>;
  private readonly inFlight = new Set<string>();
  private running = false;

  constructor(config: MatchingLoopConfig, deps: MatchingLoopDependencies) {
    this.config = config;
    this.repo = deps.repo;
    this.submitter = deps.submitter;
    this.clock = deps.clock ?? defaultClock;
    this.logger = deps.logger ?? defaultLogger;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error('tick failed', {error: err instanceof Error ? err.message : String(err)});
      }
      if (!this.running) break;
      await this.clock.sleep(this.config.pollIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }

  /** Single sweep over all configured source chains. */
  async tick(): Promise<{matchesAttempted: number; matchesSubmitted: number}> {
    const nowSec = Math.floor(this.clock.now() / 1000);
    let attempted = 0;
    let submitted = 0;

    // Build a unified pool of all match-eligible intents across chains.
    // findOppositeIntent expects the candidate to live on the target's
    // *destChainId*, so a single pool keyed by chain is enough.
    const pool: IntentRecord[] = [];
    for (const chainId of this.config.sourceChainIds) {
      const chunk = await this.repo.listMatchEligible(chainId, nowSec);
      pool.push(...chunk);
    }

    // Greedy single-pass match. Once an intent is matched it cannot be
    // re-matched in the same tick — track via a `claimed` Set.
    const claimed = new Set<string>();
    for (const target of pool) {
      if (claimed.has(target.intentHash)) continue;
      if (this.inFlight.has(target.intentHash)) continue;

      const candidate = findOppositeIntent(
        target,
        pool.filter((other) => !claimed.has(other.intentHash) && !this.inFlight.has(other.intentHash)),
        nowSec
      );
      if (!candidate) continue;

      attempted += 1;
      claimed.add(target.intentHash);
      claimed.add(candidate.intentHash);
      this.inFlight.add(target.intentHash);
      this.inFlight.add(candidate.intentHash);

      // Determine which side is "local" for the executeMatching call.
      // executeMatching is called on the source chain of the local intent.
      // Either side works (the destination validates the pair against
      // authoritative source-side data). Pick the lower-hash side
      // deterministically so two equal matchers converge.
      const [localHash, remoteHash, sourceChainId] =
        target.intentHash < candidate.intentHash
          ? [target.intentHash, candidate.intentHash, target.sourceChainId]
          : [candidate.intentHash, target.intentHash, candidate.sourceChainId];

      // Fire-and-forget; await separately below so we can clear inFlight.
      const submission = this.submitter({sourceChainId, localHash, remoteHash})
        .then((result) => {
          if ('txHash' in result) {
            submitted += 1;
            this.logger.info('match submitted', {localHash, remoteHash, txHash: result.txHash});
          } else {
            this.logger.warn('match submission rejected', {localHash, remoteHash, error: result.error});
          }
        })
        .catch((err) => {
          this.logger.error('match submission threw', {
            localHash,
            remoteHash,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.inFlight.delete(target.intentHash);
          this.inFlight.delete(candidate.intentHash);
        });
      // Hold the promise so the test can await tick() to completion.
      await submission;
    }

    return {matchesAttempted: attempted, matchesSubmitted: submitted};
  }

  /** For tests / metrics. */
  inFlightCount(): number {
    return this.inFlight.size;
  }
}
