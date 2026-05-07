/**
 * Phase 1 supported corridor: Ethereum ↔ Base, mainnet + Sepolia testnet.
 *
 * `lib/contracts.ts` carries the deployed addresses; this file is the
 * thinner UX-level list — short names, the wagmi `chains` array we feed
 * into the network-switch button, etc. Two layers because the UI cares
 * about display while the contract reader cares about deployments.
 */

import {base, baseSepolia, mainnet, sepolia} from 'wagmi/chains';

export const SUPPORTED_CHAINS = [mainnet, base, sepolia, baseSepolia] as const;

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
};

export function chainShortName(chainId: number): string {
  return SHORT_NAMES[chainId] ?? `Chain ${chainId}`;
}
