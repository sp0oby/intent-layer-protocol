/**
 * Backend runtime composition. Reads per-chain config from process.env,
 * wires up indexers, the matching loop, the auction orchestrator, and the
 * publishing repository (for WebSocket fan-out), and exposes start/stop
 * lifecycle.
 *
 * Single-process deployment for Phase 1 MVP: one Node process runs every
 * subsystem. Production scale-out splits these into separate processes
 * sharing the DB; the construction sites here are the natural seams.
 *
 * Env-driven so a developer can boot the API alone (without indexer or
 * matcher) by leaving the chain RPCs unset. Subsystems that lack required
 * env vars log a warning and stay disabled rather than crashing the
 * process — useful for local dev without all chains configured.
 */

import {JsonRpcProvider, Wallet} from 'ethers';
import IntentSettlerAbi from './abis/IntentSettler.json' with {type: 'json'};
import SolverAuctionAbi from './abis/SolverAuction.json' with {type: 'json'};
import {IntentIndexer} from './services/indexer.js';
import {intentSettlerHandlers, solverAuctionHandlers} from './services/indexer-handlers.js';
import {MatchingLoop, type MatchSubmitter} from './services/matching-loop.js';
import {AuctionOrchestrator, type AuctionSubmitter} from './services/auction-orchestrator.js';
import {buildChainSubmitters} from './services/chain-submitters.js';
import type {OrderBookRepository} from './db/repository.js';

export interface ChainEnvConfig {
  chainId: number;
  /** Chain id of the counterparty in this corridor (Phase 1: 1 ↔ 8453). */
  counterpartyChainId: number;
  rpcUrl: string;
  intentSettler: string;
  solverAuction: string;
  /** Block at which IntentSettler was deployed. */
  startBlock: number;
  /** Confirmations the indexer waits before processing logs. */
  confirmations: number;
  /** Max blocks per getLogs call. */
  batchSize: number;
}

export interface RuntimeEnvConfig {
  chains: ChainEnvConfig[];
  /** Hex private key, 0x-prefixed. Optional — without it, the matching
   *  loop and auction orchestrator stay disabled (read-only mode). */
  relayerPrivateKey?: string;
  /** Indexer poll cadence in ms. Defaults to 5000. */
  indexerPollIntervalMs?: number;
  /** Matching loop tick cadence in ms. Defaults to 5000. */
  matcherPollIntervalMs?: number;
  /** Auction orchestrator tick cadence in ms. Defaults to 10000. */
  auctionPollIntervalMs?: number;
}

export interface RuntimeHandle {
  /** Stop every subsystem. Resolves when all loops have observed the stop signal. */
  stop: () => Promise<void>;
}

export interface RuntimeDependencies {
  repo: OrderBookRepository;
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

const defaultLogger = {
  info: (msg: string, meta?: Record<string, unknown>): void => console.info(`[runtime] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>): void => console.warn(`[runtime] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>): void => console.error(`[runtime] ${msg}`, meta ?? ''),
};

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeEnvConfig {
  const chains: ChainEnvConfig[] = [];

  const ethRpc = env.ETH_RPC_URL;
  const ethSettler = env.ETH_SETTLER_ADDRESS;
  const ethAuction = env.ETH_SOLVER_AUCTION_ADDRESS ?? env.SOLVER_AUCTION_ADDRESS;
  if (ethRpc && ethSettler && ethAuction) {
    chains.push({
      chainId: Number(env.ETH_CHAIN_ID ?? 1),
      counterpartyChainId: Number(env.BASE_CHAIN_ID ?? 8453),
      rpcUrl: ethRpc,
      intentSettler: ethSettler,
      solverAuction: ethAuction,
      startBlock: Number(env.ETH_INDEXER_START_BLOCK ?? 0),
      confirmations: Number(env.ETH_CONFIRMATIONS ?? 12),
      batchSize: Number(env.ETH_INDEXER_BATCH_SIZE ?? 2000),
    });
  }

  const baseRpc = env.BASE_RPC_URL;
  const baseSettler = env.BASE_SETTLER_ADDRESS;
  const baseAuction = env.BASE_SOLVER_AUCTION_ADDRESS ?? env.SOLVER_AUCTION_ADDRESS;
  if (baseRpc && baseSettler && baseAuction) {
    chains.push({
      chainId: Number(env.BASE_CHAIN_ID ?? 8453),
      counterpartyChainId: Number(env.ETH_CHAIN_ID ?? 1),
      rpcUrl: baseRpc,
      intentSettler: baseSettler,
      solverAuction: baseAuction,
      startBlock: Number(env.BASE_INDEXER_START_BLOCK ?? 0),
      confirmations: Number(env.BASE_CONFIRMATIONS ?? 1),
      batchSize: Number(env.BASE_INDEXER_BATCH_SIZE ?? 5000),
    });
  }

  return {
    chains,
    relayerPrivateKey: env.RELAYER_PRIVATE_KEY,
    indexerPollIntervalMs: Number(env.INDEXER_POLL_INTERVAL_MS ?? 5000),
    matcherPollIntervalMs: Number(env.MATCHER_POLL_INTERVAL_MS ?? 5000),
    auctionPollIntervalMs: Number(env.AUCTION_POLL_INTERVAL_MS ?? 10000),
  };
}

const isPlaceholderAddress = (addr: string | undefined): boolean =>
  !addr || /^0x0+$/.test(addr.toLowerCase());

export function startRuntime(config: RuntimeEnvConfig, deps: RuntimeDependencies): RuntimeHandle {
  const logger = deps.logger ?? defaultLogger;

  const usableChains = config.chains.filter((c) => {
    if (isPlaceholderAddress(c.intentSettler) || isPlaceholderAddress(c.solverAuction)) {
      logger.warn('skipping chain — placeholder address', {chainId: c.chainId});
      return false;
    }
    return true;
  });

  if (usableChains.length === 0) {
    logger.warn('no chains configured — runtime running in API-only mode');
    return {stop: async () => {}};
  }

  const indexers: IntentIndexer[] = [];
  const indexerLoops: Promise<void>[] = [];
  for (const chain of usableChains) {
    const provider = new JsonRpcProvider(chain.rpcUrl);
    const settlerIdx = new IntentIndexer(
      {
        chainId: chain.chainId,
        contractAddress: chain.intentSettler,
        abi: IntentSettlerAbi,
        handlers: intentSettlerHandlers(chain.chainId, chain.counterpartyChainId),
        startBlock: chain.startBlock,
        confirmations: chain.confirmations,
        batchSize: chain.batchSize,
        pollIntervalMs: config.indexerPollIntervalMs ?? 5000,
        backoffBaseMs: 1000,
        maxBackoffMs: 60_000,
      },
      {provider, repo: deps.repo, logger}
    );
    const auctionIdx = new IntentIndexer(
      {
        chainId: chain.chainId,
        contractAddress: chain.solverAuction,
        abi: SolverAuctionAbi,
        handlers: solverAuctionHandlers(),
        startBlock: chain.startBlock,
        confirmations: chain.confirmations,
        batchSize: chain.batchSize,
        pollIntervalMs: config.indexerPollIntervalMs ?? 5000,
        backoffBaseMs: 1000,
        maxBackoffMs: 60_000,
      },
      {provider, repo: deps.repo, logger}
    );
    indexers.push(settlerIdx, auctionIdx);
    indexerLoops.push(settlerIdx.start(), auctionIdx.start());
  }

  let matchingLoop: MatchingLoop | undefined;
  let auctionOrchestrator: AuctionOrchestrator | undefined;
  const subsystemLoops: Promise<void>[] = [...indexerLoops];

  if (config.relayerPrivateKey && config.relayerPrivateKey !== '') {
    // Build per-chain submitters keyed by chainId. Each is bound to its
    // own provider+signer pair so a tx for chain X never accidentally
    // hits chain Y's RPC.
    const matchSubmitters = new Map<number, MatchSubmitter>();
    const openSubmitters = new Map<number, AuctionSubmitter>();
    const finalizeSubmitters = new Map<number, AuctionSubmitter>();
    for (const chain of usableChains) {
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const signer = new Wallet(config.relayerPrivateKey, provider);
      const bundle = buildChainSubmitters({
        chainId: chain.chainId,
        signer,
        intentSettler: chain.intentSettler,
        solverAuction: chain.solverAuction,
      });
      matchSubmitters.set(chain.chainId, bundle.matchSubmitter);
      openSubmitters.set(chain.chainId, bundle.openAuctionSubmitter);
      finalizeSubmitters.set(chain.chainId, bundle.finalizeAuctionSubmitter);
    }

    const dispatchByChain =
      <T>(map: Map<number, (input: T & {sourceChainId: number}) => Promise<unknown>>) =>
      async (input: T & {sourceChainId: number}) => {
        const submitter = map.get(input.sourceChainId);
        if (!submitter) return {error: `no submitter for chainId ${input.sourceChainId}`};
        return submitter(input);
      };

    matchingLoop = new MatchingLoop(
      {
        sourceChainIds: usableChains.map((c) => c.chainId),
        pollIntervalMs: config.matcherPollIntervalMs ?? 5000,
      },
      {
        repo: deps.repo,
        submitter: dispatchByChain(matchSubmitters) as MatchSubmitter,
        logger,
      }
    );
    auctionOrchestrator = new AuctionOrchestrator(
      {
        sourceChainIds: usableChains.map((c) => c.chainId),
        pollIntervalMs: config.auctionPollIntervalMs ?? 10000,
      },
      {
        repo: deps.repo,
        openSubmitter: dispatchByChain(openSubmitters) as AuctionSubmitter,
        finalizeSubmitter: dispatchByChain(finalizeSubmitters) as AuctionSubmitter,
        logger,
      }
    );
    subsystemLoops.push(matchingLoop.start(), auctionOrchestrator.start());
  } else {
    logger.warn('RELAYER_PRIVATE_KEY unset — matching + auction loops disabled (indexer-only mode)');
  }

  logger.info('runtime started', {
    chains: usableChains.map((c) => c.chainId),
    indexers: indexers.length,
    matchingLoop: matchingLoop !== undefined,
    auctionOrchestrator: auctionOrchestrator !== undefined,
  });

  return {
    async stop() {
      for (const idx of indexers) idx.stop();
      matchingLoop?.stop();
      auctionOrchestrator?.stop();
      // Allow each loop to observe the stop flag and exit.
      await Promise.allSettled(subsystemLoops);
    },
  };
}
