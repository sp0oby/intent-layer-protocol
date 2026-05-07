/**
 * Phase 1 supported corridor: Ethereum ↔ Base, mainnet + Sepolia testnet,
 * plus a local-Anvil pair (31337 ↔ 31338) that mirrors the Stage 4 E2E
 * harness for hand-on-keyboard testing.
 *
 * `lib/contracts.ts` carries the deployed addresses; this file is the
 * thinner UX-level list — short names, the wagmi `chains` array we feed
 * into the network-switch button, etc. Two layers because the UI cares
 * about display while the contract reader cares about deployments.
 */

import {defineChain} from 'viem';
import {base, baseSepolia, mainnet, sepolia} from 'wagmi/chains';

const anvilEthRpc = process.env.NEXT_PUBLIC_LOCAL_ETH_RPC_URL ?? 'http://127.0.0.1:38545';
const anvilBaseRpc = process.env.NEXT_PUBLIC_LOCAL_BASE_RPC_URL ?? 'http://127.0.0.1:38546';

/** Local Anvil — Eth half. Chain id matches the Stage 4 E2E test
 *  (`backend/tests/e2e/full-roundtrip.test.ts` uses 31337 for the Eth
 *  Anvil and 31338 for the Base Anvil). Override RPC URL via
 *  NEXT_PUBLIC_LOCAL_ETH_RPC_URL when running on different ports. */
export const localAnvilEth = defineChain({
  id: 31337,
  name: 'Local Anvil (Eth)',
  nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
  rpcUrls: {default: {http: [anvilEthRpc]}},
  testnet: true,
});

/** Local Anvil — Base half. Pairs with localAnvilEth as the cross-chain
 *  destination. RPC override: NEXT_PUBLIC_LOCAL_BASE_RPC_URL. */
export const localAnvilBase = defineChain({
  id: 31338,
  name: 'Local Anvil (Base)',
  nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
  rpcUrls: {default: {http: [anvilBaseRpc]}},
  testnet: true,
});

export const SUPPORTED_CHAINS = [mainnet, base, sepolia, baseSepolia, localAnvilEth, localAnvilBase] as const;

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

export const SUPPORTED_CHAIN_IDS = SUPPORTED_CHAINS.map((c) => c.id) as readonly number[];

export function isSupportedChain(chainId: number | undefined): chainId is SupportedChainId {
  return chainId !== undefined && SUPPORTED_CHAIN_IDS.includes(chainId);
}

/** Short label for the wallet bar — full chain.name is too long. */
const SHORT_NAMES: Record<number, string> = {
  [mainnet.id]: 'Ethereum',
  [base.id]: 'Base',
  [sepolia.id]: 'Sepolia',
  [baseSepolia.id]: 'Base Sepolia',
  [localAnvilEth.id]: 'Anvil Eth',
  [localAnvilBase.id]: 'Anvil Base',
};

export function chainShortName(chainId: number): string {
  return SHORT_NAMES[chainId] ?? `Chain ${chainId}`;
}
