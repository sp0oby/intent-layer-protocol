/**
 * Display helpers shared between status + history pages. Extracted from
 * the per-page duplicates so we have one place to test and one place
 * to fix display bugs.
 */

import {formatUnits} from 'viem';
import {findToken} from './tokens';

/** Format a uint256 amount via the per-chain token registry. Falls back
 *  to the raw string + truncated address for unknown tokens (custom
 *  tokens, future chains, malformed data). */
export function formatTokenAmount(amountWei: string, tokenAddr: string, chainId: number): string {
  for (const symbol of ['ETH', 'USDC', 'USDT'] as const) {
    const token = findToken(chainId, symbol);
    if (token && token.address.toLowerCase() === tokenAddr.toLowerCase()) {
      return `${formatUnits(BigInt(amountWei), token.decimals)} ${token.symbol}`;
    }
  }
  return `${amountWei} (${tokenAddr.slice(0, 6)}…)`;
}

/** Truncate a 0x-prefixed address to "0x1234…cdef". Anything that isn't
 *  a 42-char address is returned unchanged. */
export function truncateAddress(addr: string): string {
  return addr.length === 42 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Ago-style relative time string. Input is seconds ago (a non-negative
 *  number). Below 60s reads "just now". */
export function relativeTime(secondsAgo: number): string {
  if (secondsAgo < 60) return 'just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86_400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86_400)}d ago`;
}
