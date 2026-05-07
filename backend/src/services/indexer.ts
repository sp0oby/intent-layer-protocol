/**
 * Multi-chain event indexer for the Intent Layer Protocol.
 *
 * Polls each (chain, contract) pair on a configurable interval, dispatches
 * each parsed log to a handler, and durably advances the indexer_cursors
 * row only after every handler in the batch has succeeded inside one
 * Postgres transaction.
 *
 * Design notes:
 *   - We use `getLogs` polling rather than `provider.on(filter)` because
 *     restart-recovery and back-fill require it. The polling interval and
 *     block-window size are tunable per chain (Eth ~12s, Base ~2s).
 *   - One IntentIndexer instance per (chain, contract) pair so failures
 *     are isolated and the lock-step block-window doesn't bunch up. The
 *     caller orchestrates as many as it needs.
 *   - Confirmation depth is applied at the read side: we only process
 *     logs whose block <= head - confirmations. This avoids needing
 *     reorg-rollback logic in the DB layer (LayerZero V2 default DVN
 *     depth is 12 on Ethereum, 1 on Base — using the same numbers here
 *     keeps the indexer's view in sync with what the protocol trusts).
 */

import {Interface, type JsonRpcProvider, type Log} from 'ethers';
import type {ContractHandlers, LogContext} from './indexer-handlers.js';
import type {OrderBookRepository} from '../db/repository.js';

export interface IndexerConfig {
  chainId: number;
  contractAddress: string;
  abi: ReadonlyArray<unknown>;
  handlers: ContractHandlers;
  /** Block at which the contract was deployed; the indexer will not look
   *  earlier than this even if the cursor row is missing. */
  startBlock: number;
  /** Confirmations required before a log is considered safe to index.
   *  Eth ~12, Base ~1. */
  confirmations: number;
  /** Max blocks to fetch in one getLogs call. RPCs typically cap this at
   *  500 / 2000 / 10000; tune per provider. */
  batchSize: number;
  /** Milliseconds between polls when caught up. */
  pollIntervalMs: number;
  /** Backoff base in ms for failed polls. Doubles up to maxBackoffMs. */
  backoffBaseMs: number;
  maxBackoffMs: number;
}

export interface IndexerDependencies {
  provider: JsonRpcProvider;
  repo: OrderBookRepository;
  /** Override Date.now / setTimeout for tests. */
  clock?: {
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  };
  /** Optional structured logger. Defaults to console. */
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
  info: (msg: string, meta?: Record<string, unknown>): void => console.info(`[indexer] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>): void => console.warn(`[indexer] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>): void => console.error(`[indexer] ${msg}`, meta ?? ''),
};

export class IntentIndexer {
  private readonly config: IndexerConfig;
  private readonly provider: JsonRpcProvider;
  private readonly repo: OrderBookRepository;
  private readonly iface: Interface;
  private readonly clock: NonNullable<IndexerDependencies['clock']>;
  private readonly logger: NonNullable<IndexerDependencies['logger']>;

  private running = false;
  private currentBackoff: number;
  private blockTimestampCache = new Map<number, number>();

  constructor(config: IndexerConfig, deps: IndexerDependencies) {
    this.config = config;
    this.provider = deps.provider;
    this.repo = deps.repo;
    this.iface = new Interface(config.abi as ReadonlyArray<unknown> as never);
    this.clock = deps.clock ?? defaultClock;
    this.logger = deps.logger ?? defaultLogger;
    this.currentBackoff = config.backoffBaseMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger.info('starting', {chainId: this.config.chainId, contract: this.config.contractAddress});
    while (this.running) {
      try {
        const advanced = await this.processOnce();
        this.currentBackoff = this.config.backoffBaseMs;
        if (!advanced) {
          await this.clock.sleep(this.config.pollIntervalMs);
        }
      } catch (err) {
        this.logger.error('poll failed', {
          chainId: this.config.chainId,
          contract: this.config.contractAddress,
          error: err instanceof Error ? err.message : String(err),
        });
        await this.clock.sleep(this.currentBackoff);
        this.currentBackoff = Math.min(this.currentBackoff * 2, this.config.maxBackoffMs);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  /** Single iteration: read cursor, fetch logs in one batch window, dispatch,
   *  advance cursor. Returns true if any new logs were processed (caller
   *  loops without sleeping when caught-up signal is false). */
  async processOnce(): Promise<boolean> {
    const head = await this.provider.getBlockNumber();
    const safeHead = head - this.config.confirmations;
    if (safeHead < this.config.startBlock) return false;

    const cursor = await this.repo.readCursor(this.config.chainId, this.config.contractAddress);
    const fromBlock = cursor === null ? this.config.startBlock : cursor + 1;
    if (fromBlock > safeHead) return false;

    const toBlock = Math.min(fromBlock + this.config.batchSize - 1, safeHead);
    const logs = await this.provider.getLogs({
      address: this.config.contractAddress,
      fromBlock,
      toBlock,
    });

    await this.repo.withTransaction(async (client) => {
      for (const log of logs) {
        await this.dispatchLog(log, client);
      }
      await this.repo.advanceCursor(
        {chainId: this.config.chainId, contractAddress: this.config.contractAddress, lastProcessedBlock: toBlock},
        client
      );
    });

    if (logs.length > 0) {
      this.logger.info('processed batch', {
        chainId: this.config.chainId,
        contract: this.config.contractAddress,
        fromBlock,
        toBlock,
        count: logs.length,
      });
    }
    this.pruneTimestampCache(toBlock);
    return true;
  }

  private async dispatchLog(log: Log, _client: unknown): Promise<void> {
    let parsed;
    try {
      parsed = this.iface.parseLog({topics: Array.from(log.topics), data: log.data});
    } catch (err) {
      // Foreign event from the same address (e.g. OApp ownership events we
      // don't care about). Skip silently — strict-parsing every event would
      // require us to enumerate every base-class event in the ABI.
      return;
    }
    if (parsed === null) return;
    const handler = this.config.handlers[parsed.name];
    if (!handler) return;

    const blockTimestamp = await this.timestampFor(log.blockNumber);
    const ctx: LogContext = {
      blockNumber: log.blockNumber,
      blockTimestamp,
      transactionHash: log.transactionHash,
    };
    await handler(parsed, ctx, this.repo);
  }

  private async timestampFor(blockNumber: number): Promise<number> {
    const cached = this.blockTimestampCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await this.provider.getBlock(blockNumber);
    if (block === null) throw new Error(`block ${blockNumber} not found`);
    this.blockTimestampCache.set(blockNumber, Number(block.timestamp));
    return Number(block.timestamp);
  }

  private pruneTimestampCache(beforeBlock: number): void {
    // Keep cache small — drop entries we'll never re-look-up because the
    // cursor has moved past them.
    for (const blockNumber of this.blockTimestampCache.keys()) {
      if (blockNumber < beforeBlock - 1000) this.blockTimestampCache.delete(blockNumber);
    }
  }
}

export const __testing = {defaultClock, defaultLogger};
