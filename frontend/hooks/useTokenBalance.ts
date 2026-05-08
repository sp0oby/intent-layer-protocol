'use client';

import {formatUnits} from 'viem';
import {useBalance, useReadContract} from 'wagmi';
import {erc20Abi} from '@/lib/erc20-abi';
import type {Token} from '@/lib/tokens';

export interface TokenBalance {
  raw: bigint;
  formatted: string;
  decimals: number;
}

/**
 * Reads the connected wallet's balance of a token on a given chain.
 * Native ETH goes through wagmi's useBalance (no token contract); ERC-20
 * uses a balanceOf read against the token address. Returns undefined
 * when any prerequisite is missing (no address, no token, no chainId)
 * so callers can render placeholder UI without conditional hook calls.
 *
 * Refresh cadence: 8s — fast enough that a freshly-confirmed transfer
 * surfaces quickly, slow enough not to thrash the RPC.
 */
export function useTokenBalance(
  address: `0x${string}` | undefined,
  token: Token | undefined,
  chainId: number | undefined
): TokenBalance | undefined {
  const enabled = Boolean(address && token && chainId);
  const isNative = Boolean(token?.isNative);

  const native = useBalance({
    address: enabled && isNative ? address : undefined,
    chainId,
    query: {
      enabled: enabled && isNative,
      refetchInterval: 8_000,
    },
  });

  const erc20 = useReadContract({
    abi: erc20Abi,
    functionName: 'balanceOf',
    address: enabled && !isNative ? token!.address : undefined,
    args: enabled && !isNative && address ? [address] : undefined,
    chainId,
    query: {
      enabled: enabled && !isNative,
      refetchInterval: 8_000,
    },
  });

  if (!token) return undefined;

  if (isNative) {
    if (!native.data) return undefined;
    return {
      raw: native.data.value,
      formatted: formatUnits(native.data.value, native.data.decimals),
      decimals: native.data.decimals,
    };
  }

  const raw = erc20.data;
  if (raw === undefined) return undefined;
  return {
    raw,
    formatted: formatUnits(raw, token.decimals),
    decimals: token.decimals,
  };
}

/**
 * Format a balance for display in the quick-amounts area. Trims trailing
 * zeros and caps fractional digits so "1000.000000" renders as "1,000".
 * Keeps up to 6 fractional digits for tokens with small balances.
 */
export function formatBalance(balance: TokenBalance | undefined): string | undefined {
  if (!balance) return undefined;
  const num = parseFloat(balance.formatted);
  if (!isFinite(num)) return undefined;
  if (num === 0) return '0';
  if (num >= 1000) return num.toLocaleString(undefined, {maximumFractionDigits: 2});
  if (num >= 1) return num.toLocaleString(undefined, {maximumFractionDigits: 4});
  if (num >= 0.0001) return num.toFixed(6);
  return num.toExponential(3);
}
