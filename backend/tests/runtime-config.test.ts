import {describe, expect, it} from 'vitest';
import {loadRuntimeConfig} from '../src/runtime';

describe('loadRuntimeConfig', () => {
  it('returns no chains when neither RPC is set', () => {
    const config = loadRuntimeConfig({});
    expect(config.chains).toEqual([]);
  });

  it('includes Ethereum when ETH_RPC + addresses are set', () => {
    const config = loadRuntimeConfig({
      ETH_RPC_URL: 'http://localhost:8545',
      ETH_SETTLER_ADDRESS: '0x1111111111111111111111111111111111111111',
      ETH_SOLVER_AUCTION_ADDRESS: '0x2222222222222222222222222222222222222222',
    });
    expect(config.chains).toHaveLength(1);
    expect(config.chains[0]).toMatchObject({
      chainId: 1,
      counterpartyChainId: 8453,
      rpcUrl: 'http://localhost:8545',
      confirmations: 12,
    });
  });

  it('includes both chains when configured', () => {
    const config = loadRuntimeConfig({
      ETH_RPC_URL: 'http://localhost:8545',
      ETH_SETTLER_ADDRESS: '0x1111111111111111111111111111111111111111',
      ETH_SOLVER_AUCTION_ADDRESS: '0x2222222222222222222222222222222222222222',
      BASE_RPC_URL: 'http://localhost:8546',
      BASE_SETTLER_ADDRESS: '0x3333333333333333333333333333333333333333',
      BASE_SOLVER_AUCTION_ADDRESS: '0x4444444444444444444444444444444444444444',
    });
    expect(config.chains).toHaveLength(2);
    expect(config.chains.map((c) => c.chainId).sort()).toEqual([1, 8453]);
    const base = config.chains.find((c) => c.chainId === 8453);
    expect(base?.confirmations).toBe(1);
  });

  it('falls back to SOLVER_AUCTION_ADDRESS when chain-specific is missing', () => {
    const config = loadRuntimeConfig({
      ETH_RPC_URL: 'http://localhost:8545',
      ETH_SETTLER_ADDRESS: '0x1111111111111111111111111111111111111111',
      SOLVER_AUCTION_ADDRESS: '0x9999999999999999999999999999999999999999',
    });
    expect(config.chains).toHaveLength(1);
    expect(config.chains[0].solverAuction).toBe('0x9999999999999999999999999999999999999999');
  });

  it('parses cadence overrides', () => {
    const config = loadRuntimeConfig({
      INDEXER_POLL_INTERVAL_MS: '1000',
      MATCHER_POLL_INTERVAL_MS: '2000',
      AUCTION_POLL_INTERVAL_MS: '3000',
    });
    expect(config.indexerPollIntervalMs).toBe(1000);
    expect(config.matcherPollIntervalMs).toBe(2000);
    expect(config.auctionPollIntervalMs).toBe(3000);
  });
});
