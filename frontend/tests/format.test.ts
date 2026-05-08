import {describe, expect, it} from 'vitest';
import {formatTokenAmount, relativeTime, truncateAddress} from '@/lib/format';

describe('truncateAddress', () => {
  it('truncates a 42-char 0x address to 0x1234…cdef', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x1234…5678'
    );
  });

  it('returns short or non-address strings unchanged', () => {
    expect(truncateAddress('not an address')).toBe('not an address');
    expect(truncateAddress('0x1234')).toBe('0x1234');
  });
});

describe('relativeTime', () => {
  it('returns "just now" below 60 seconds', () => {
    expect(relativeTime(0)).toBe('just now');
    expect(relativeTime(30)).toBe('just now');
    expect(relativeTime(59)).toBe('just now');
  });

  it('rounds minutes down', () => {
    expect(relativeTime(60)).toBe('1m ago');
    expect(relativeTime(119)).toBe('1m ago');
    expect(relativeTime(120)).toBe('2m ago');
  });

  it('uses hours past 60 minutes', () => {
    expect(relativeTime(3600)).toBe('1h ago');
    expect(relativeTime(3600 * 2 + 600)).toBe('2h ago');
  });

  it('uses days past 24 hours', () => {
    expect(relativeTime(86_400)).toBe('1d ago');
    expect(relativeTime(86_400 * 3)).toBe('3d ago');
  });
});

describe('formatTokenAmount', () => {
  // Mainnet USDC (6 decimals) — already in the registry for chain 1
  const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  it('formats native ETH (18 decimals) on chain 1', () => {
    const ZERO = '0x0000000000000000000000000000000000000000';
    expect(formatTokenAmount('1000000000000000000', ZERO, 1)).toBe('1 ETH');
    expect(formatTokenAmount('500000000000000000', ZERO, 1)).toBe('0.5 ETH');
  });

  it('formats USDC (6 decimals) on chain 1, case-insensitive on the address', () => {
    expect(formatTokenAmount('2400000000', USDC_ETH, 1)).toBe('2400 USDC');
    expect(formatTokenAmount('2400000000', USDC_ETH.toLowerCase(), 1)).toBe('2400 USDC');
  });

  it('falls back to raw string + truncated address for unknown tokens', () => {
    const UNKNOWN = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const out = formatTokenAmount('123456', UNKNOWN, 1);
    expect(out).toContain('123456');
    expect(out).toContain('0xdead');
  });

  it('falls back when the chain is unsupported (no token registry)', () => {
    const SOMETHING = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const out = formatTokenAmount('1', SOMETHING, 9999);
    expect(out).toMatch(/^1 \(/);
  });
});
