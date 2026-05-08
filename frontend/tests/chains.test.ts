import {describe, expect, it} from 'vitest';
import {chainShortName, isSupportedChain, SUPPORTED_CHAIN_IDS} from '@/lib/chains';

describe('isSupportedChain', () => {
  it('accepts every chain in the SUPPORTED_CHAIN_IDS list', () => {
    for (const id of SUPPORTED_CHAIN_IDS) {
      expect(isSupportedChain(id)).toBe(true);
    }
  });

  it('rejects unsupported chain ids', () => {
    expect(isSupportedChain(137)).toBe(false); // Polygon
    expect(isSupportedChain(42161)).toBe(false); // Arbitrum
    expect(isSupportedChain(undefined)).toBe(false);
    expect(isSupportedChain(0)).toBe(false);
  });
});

describe('chainShortName', () => {
  it('uses the short label for known chains', () => {
    expect(chainShortName(1)).toBe('Ethereum');
    expect(chainShortName(8453)).toBe('Base');
    expect(chainShortName(11155111)).toBe('Sepolia');
    expect(chainShortName(84532)).toBe('Base Sepolia');
    expect(chainShortName(31337)).toBe('Anvil Eth');
    expect(chainShortName(31338)).toBe('Anvil Base');
  });

  it('falls back to "Chain N" for unknown ids', () => {
    expect(chainShortName(137)).toBe('Chain 137');
    expect(chainShortName(0)).toBe('Chain 0');
  });
});
