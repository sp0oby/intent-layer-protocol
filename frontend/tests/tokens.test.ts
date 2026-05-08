import {describe, expect, it} from 'vitest';
import {findToken, partnerChainOf, tokenAvailableOnBothChains, tokensForChain} from '@/lib/tokens';

describe('partnerChainOf', () => {
  it('pairs Ethereum mainnet ↔ Base mainnet', () => {
    expect(partnerChainOf(1)).toBe(8453);
    expect(partnerChainOf(8453)).toBe(1);
  });

  it('pairs Sepolia ↔ Base Sepolia', () => {
    expect(partnerChainOf(11155111)).toBe(84532);
    expect(partnerChainOf(84532)).toBe(11155111);
  });

  it('pairs the local Anvils 31337 ↔ 31338', () => {
    expect(partnerChainOf(31337)).toBe(31338);
    expect(partnerChainOf(31338)).toBe(31337);
  });

  it('returns undefined for unsupported chains', () => {
    expect(partnerChainOf(137)).toBeUndefined(); // Polygon
    expect(partnerChainOf(undefined)).toBeUndefined();
    expect(partnerChainOf(0)).toBeUndefined();
  });
});

describe('tokensForChain', () => {
  it('every supported chain lists ETH as the first entry (native)', () => {
    for (const chainId of [1, 8453, 11155111, 84532, 31337, 31338]) {
      const tokens = tokensForChain(chainId);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('ETH');
      expect(tokens[0].isNative).toBe(true);
    }
  });

  it('returns an empty list for unsupported chains', () => {
    expect(tokensForChain(137)).toEqual([]);
    expect(tokensForChain(undefined)).toEqual([]);
  });
});

describe('findToken', () => {
  it('locates ETH on every supported chain', () => {
    for (const chainId of [1, 8453, 11155111, 84532, 31337, 31338]) {
      const eth = findToken(chainId, 'ETH');
      expect(eth).toBeDefined();
      expect(eth?.symbol).toBe('ETH');
      expect(eth?.decimals).toBe(18);
    }
  });

  it('locates USDC on every supported chain', () => {
    for (const chainId of [1, 8453, 11155111, 84532, 31337, 31338]) {
      const usdc = findToken(chainId, 'USDC');
      expect(usdc).toBeDefined();
      expect(usdc?.symbol).toBe('USDC');
      expect(usdc?.decimals).toBe(6);
    }
  });

  it('USDT only on Ethereum mainnet (Base + testnets do not list it)', () => {
    expect(findToken(1, 'USDT')).toBeDefined();
    expect(findToken(8453, 'USDT')).toBeUndefined();
    expect(findToken(11155111, 'USDT')).toBeUndefined();
    expect(findToken(84532, 'USDT')).toBeUndefined();
    expect(findToken(31337, 'USDT')).toBeUndefined();
  });
});

describe('tokenAvailableOnBothChains', () => {
  it('true when both chains list both symbols', () => {
    expect(tokenAvailableOnBothChains(1, 8453, 'ETH', 'USDC')).toBe(true);
    expect(tokenAvailableOnBothChains(31337, 31338, 'ETH', 'USDC')).toBe(true);
  });

  it('false when the dest chain does not list the dest token', () => {
    // USDT not on Base
    expect(tokenAvailableOnBothChains(1, 8453, 'ETH', 'USDT')).toBe(false);
  });

  it('false when the source chain does not list the source token', () => {
    expect(tokenAvailableOnBothChains(8453, 1, 'USDT', 'ETH')).toBe(false);
  });
});
