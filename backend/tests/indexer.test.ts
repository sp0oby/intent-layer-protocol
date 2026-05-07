import {describe, expect, it, vi} from 'vitest';
import {Interface, getAddress, type Log} from 'ethers';
import IntentSettlerAbi from '../src/abis/IntentSettler.json';
import SolverAuctionAbi from '../src/abis/SolverAuction.json';
import {
  handleIntentSubmitted,
  handleIntentCancelled,
  handleIntentMatched,
  handleAuctionOpened,
  handleIntentSettled,
  handleIntentRefunded,
  handleProposalSubmitted,
  handleWinnerSelected,
  intentSettlerHandlers,
  type LogContext,
} from '../src/services/indexer-handlers';
import {IntentIndexer, type IndexerConfig} from '../src/services/indexer';
import type {OrderBookRepository} from '../src/db/repository';

// ethers v6 parseLog returns EIP-55 checksummed addresses; expected values
// in the test assertions use the same canonicalization so equality matches.
const SETTLER_ADDR = getAddress('0x1111111111111111111111111111111111111111');
const ALICE = getAddress('0xaaaa000000000000000000000000000000000001');
const BOB = getAddress('0xbbbb000000000000000000000000000000000002');
const ETH_TOKEN = getAddress('0x0000000000000000000000000000000000000000');
const USDC_TOKEN = getAddress('0xdddd000000000000000000000000000000000004');
const HASH_A = '0x' + 'a'.repeat(64);
const HASH_B = '0x' + 'b'.repeat(64);
const TX_HASH = '0x' + 'c'.repeat(64);

const settlerIface = new Interface(IntentSettlerAbi as never);
const auctionIface = new Interface(SolverAuctionAbi as never);

const ctx = (overrides: Partial<LogContext> = {}): LogContext => ({
  blockNumber: 100,
  blockTimestamp: 1_730_000_000,
  transactionHash: TX_HASH,
  ...overrides,
});

/** Build a minimal mock repository that records every call. */
function makeRepo() {
  const calls: Array<{method: string; args: unknown}> = [];
  const fakeAsync = (method: string) =>
    vi.fn(async (args: unknown) => {
      calls.push({method, args});
    });
  const repo: OrderBookRepository = {
    insertIntent: fakeAsync('insertIntent'),
    markMatched: fakeAsync('markMatched'),
    markCancelled: fakeAsync('markCancelled'),
    markSettled: fakeAsync('markSettled'),
    markRefunded: fakeAsync('markRefunded'),
    markAuctioning: fakeAsync('markAuctioning'),
    upsertProposal: fakeAsync('upsertProposal'),
    markProposalWinner: fakeAsync('markProposalWinner'),
    readCursor: vi.fn(async () => null),
    advanceCursor: fakeAsync('advanceCursor'),
    withTransaction: vi.fn(async <T>(fn: (client: never) => Promise<T>) => fn(undefined as never)),
  };
  return {repo, calls};
}

const parseSettler = (eventName: string, args: unknown[]) => {
  const fragment = settlerIface.getEvent(eventName);
  if (!fragment) throw new Error(`event not found: ${eventName}`);
  const {topics, data} = settlerIface.encodeEventLog(fragment, args);
  const parsed = settlerIface.parseLog({topics: [...topics], data});
  if (!parsed) throw new Error(`failed to parse synthetic ${eventName}`);
  return parsed;
};

const parseAuction = (eventName: string, args: unknown[]) => {
  const fragment = auctionIface.getEvent(eventName);
  if (!fragment) throw new Error(`event not found: ${eventName}`);
  const {topics, data} = auctionIface.encodeEventLog(fragment, args);
  const parsed = auctionIface.parseLog({topics: [...topics], data});
  if (!parsed) throw new Error(`failed to parse synthetic ${eventName}`);
  return parsed;
};

describe('indexer handlers', () => {
  it('IntentSubmitted decodes the full Intent tuple into insertIntent', async () => {
    const intentTuple = [
      1n, // sourceChainId
      ETH_TOKEN, // sourceToken
      1_000_000_000_000_000_000n, // sourceAmount
      8453n, // destChainId
      USDC_TOKEN, // destToken
      2_400_000_000n, // minDestAmount
      ALICE, // user
      ALICE, // refundTo
      9_999_999_999n, // deadline
      42n, // nonce
    ];
    const parsed = parseSettler('IntentSubmitted', [HASH_A, ALICE, intentTuple]);
    const {repo, calls} = makeRepo();
    await handleIntentSubmitted(parsed, ctx(), repo);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('insertIntent');
    expect(calls[0].args).toMatchObject({
      intentHash: HASH_A,
      user: ALICE,
      refundTo: ALICE,
      sourceChainId: 1,
      sourceToken: ETH_TOKEN,
      sourceAmount: '1000000000000000000',
      destChainId: 8453,
      destToken: USDC_TOKEN,
      minDestAmount: '2400000000',
      deadline: 9_999_999_999,
      nonce: '42',
      submittedAtBlockTs: 1_730_000_000,
      submitTxHash: TX_HASH,
    });
  });

  it('IntentCancelled decodes hash + uses tx hash', async () => {
    const parsed = parseSettler('IntentCancelled', [HASH_A]);
    const {repo, calls} = makeRepo();
    await handleIntentCancelled(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markCancelled',
      args: {intentHash: HASH_A, cancelTxHash: TX_HASH},
    });
  });

  it('IntentMatched fills source/dest chain id from closure', async () => {
    const parsed = parseSettler('IntentMatched', [HASH_A, HASH_B]);
    const {repo, calls} = makeRepo();
    const handler = handleIntentMatched(1, 8453);
    await handler(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markMatched',
      args: {
        localHash: HASH_A,
        remoteHash: HASH_B,
        matchTimestamp: 1_730_000_000,
        sourceChainId: 1,
        destChainId: 8453,
        executeMatchTxHash: TX_HASH,
      },
    });
  });

  it('AuctionOpened decodes deadline', async () => {
    const parsed = parseSettler('AuctionOpened', [HASH_A, 1_730_000_120n]);
    const {repo, calls} = makeRepo();
    await handleAuctionOpened(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markAuctioning',
      args: {intentHash: HASH_A, auctionDeadline: 1_730_000_120},
    });
  });

  it('IntentSettled records settle tx + block timestamp', async () => {
    const parsed = parseSettler('IntentSettled', [HASH_A, BOB, 1_000_000_000_000_000_000n]);
    const {repo, calls} = makeRepo();
    await handleIntentSettled(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markSettled',
      args: {intentHash: HASH_A, settleTxHash: TX_HASH, blockTimestamp: 1_730_000_000},
    });
  });

  it('IntentRefunded decodes hash', async () => {
    const parsed = parseSettler('IntentRefunded', [HASH_A, ALICE, 1_000_000_000_000_000_000n]);
    const {repo, calls} = makeRepo();
    await handleIntentRefunded(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markRefunded',
      args: {intentHash: HASH_A, refundTxHash: TX_HASH, blockTimestamp: 1_730_000_000},
    });
  });

  it('ProposalSubmitted decodes solver + amount (signature/fee filled by API path)', async () => {
    const parsed = parseAuction('ProposalSubmitted', [HASH_A, BOB, 2_410_000_000n]);
    const {repo, calls} = makeRepo();
    await handleProposalSubmitted(parsed, ctx(), repo);
    expect(calls[0]).toMatchObject({
      method: 'upsertProposal',
      args: {
        intentHash: HASH_A,
        solver: BOB,
        proposedOutputAmount: '2410000000',
        solverFeeBps: 0,
        signature: '0x',
      },
    });
  });

  it('WinnerSelected flips the row for that solver', async () => {
    const parsed = parseAuction('WinnerSelected', [HASH_A, BOB, 2_410_000_000n]);
    const {repo, calls} = makeRepo();
    await handleWinnerSelected(parsed, ctx(), repo);
    expect(calls[0]).toEqual({
      method: 'markProposalWinner',
      args: {intentHash: HASH_A, solver: BOB},
    });
  });
});

describe('IntentIndexer.processOnce', () => {
  const baseConfig = (): IndexerConfig => ({
    chainId: 1,
    contractAddress: SETTLER_ADDR,
    abi: IntentSettlerAbi as never,
    handlers: intentSettlerHandlers(1, 8453),
    startBlock: 100,
    confirmations: 12,
    batchSize: 1000,
    pollIntervalMs: 1000,
    backoffBaseMs: 100,
    maxBackoffMs: 5000,
  });

  function makeProvider(opts: {head: number; logs: Log[]; blockTs?: (n: number) => number}) {
    const blockTs = opts.blockTs ?? ((n: number) => 1_730_000_000 + n);
    return {
      getBlockNumber: vi.fn(async () => opts.head),
      getLogs: vi.fn(async () => opts.logs),
      getBlock: vi.fn(async (n: number) => ({number: n, timestamp: blockTs(n)})),
    } as never;
  }

  it('does nothing when no safe blocks exist yet', async () => {
    const {repo, calls} = makeRepo();
    const provider = makeProvider({head: 105, logs: []}); // safe head = 93 < startBlock 100
    const indexer = new IntentIndexer(baseConfig(), {provider, repo});
    const advanced = await indexer.processOnce();
    expect(advanced).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('processes a batch and advances the cursor inside one transaction', async () => {
    const intentTuple = [
      1n,
      ETH_TOKEN,
      1_000_000_000_000_000_000n,
      8453n,
      USDC_TOKEN,
      2_400_000_000n,
      ALICE,
      ALICE,
      9_999_999_999n,
      42n,
    ];
    const fragment = settlerIface.getEvent('IntentSubmitted')!;
    const {topics, data} = settlerIface.encodeEventLog(fragment, [HASH_A, ALICE, intentTuple]);
    const log: Log = {
      address: SETTLER_ADDR,
      blockHash: '0x' + 'd'.repeat(64),
      blockNumber: 150,
      data,
      index: 0,
      removed: false,
      topics,
      transactionHash: TX_HASH,
      transactionIndex: 0,
      toJSON: () => ({}),
    } as never;
    const {repo, calls} = makeRepo();
    const provider = makeProvider({head: 200, logs: [log]});
    const indexer = new IntentIndexer(baseConfig(), {provider, repo});
    const advanced = await indexer.processOnce();
    expect(advanced).toBe(true);
    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(['insertIntent', 'advanceCursor']);
    expect(calls[1].args).toMatchObject({
      chainId: 1,
      contractAddress: SETTLER_ADDR,
      lastProcessedBlock: 188, // safeHead = 200 - 12
    });
  });

  it('skips logs whose event the handler set does not cover', async () => {
    // Foreign-event topic that does not match any IntentSettler event.
    const log: Log = {
      address: SETTLER_ADDR,
      blockHash: '0x' + 'd'.repeat(64),
      blockNumber: 150,
      data: '0x',
      index: 0,
      removed: false,
      topics: ['0x' + 'f'.repeat(64)],
      transactionHash: TX_HASH,
      transactionIndex: 0,
      toJSON: () => ({}),
    } as never;
    const {repo, calls} = makeRepo();
    const provider = makeProvider({head: 200, logs: [log]});
    const indexer = new IntentIndexer(baseConfig(), {provider, repo});
    await indexer.processOnce();
    // Only advanceCursor — no handler invoked for the foreign topic.
    expect(calls.map((c) => c.method)).toEqual(['advanceCursor']);
  });

  it('starts at cursor + 1 when a cursor row exists', async () => {
    const {repo, calls} = makeRepo();
    (repo.readCursor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(150);
    const provider = makeProvider({head: 300, logs: []});
    const config = baseConfig();
    const indexer = new IntentIndexer(config, {provider, repo});
    await indexer.processOnce();
    expect(provider.getLogs).toHaveBeenCalledWith({
      address: SETTLER_ADDR,
      fromBlock: 151,
      toBlock: Math.min(151 + config.batchSize - 1, 288), // safe head = 288
    });
    expect(calls.find((c) => c.method === 'advanceCursor')?.args).toMatchObject({lastProcessedBlock: 288});
  });
});
