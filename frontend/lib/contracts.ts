/**
 * Per-chain contract addresses + ABIs the frontend reads from / writes to.
 *
 * Addresses come from NEXT_PUBLIC_* env vars (safe to expose — public
 * deploy addresses, not keys). ABIs are vendored from contracts/out/
 * via `npm run extract-abis`.
 *
 * Phase 1 corridors: Ethereum (mainnet 1 / Sepolia 11155111) ↔ Base
 * (mainnet 8453 / Sepolia 84532). Treat the chainId as the lookup key
 * — wagmi's `useChainId()` returns this number directly.
 */

import IntentSettlerAbi from './abis/IntentSettler.json';
import SolverAuctionAbi from './abis/SolverAuction.json';
import ChainPeerRegistryAbi from './abis/ChainPeerRegistry.json';

export {IntentSettlerAbi, SolverAuctionAbi, ChainPeerRegistryAbi};

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

const env = (name: string): `0x${string}` => {
  const value = process.env[name] ?? ZERO_ADDR;
  return value as `0x${string}`;
};

export interface ChainContracts {
  chainId: number;
  intentSettler: `0x${string}`;
  solverAuction: `0x${string}`;
  chainPeerRegistry: `0x${string}`;
}

/** Mainnet + testnet pairs. Testnets get the same env var names since
 *  staging deploys reuse the suffixes. The runtime picks the right
 *  ChainContracts based on the wagmi `chainId` the user is connected to. */
export const CONTRACTS_BY_CHAIN: Record<number, ChainContracts> = {
  // Ethereum mainnet
  1: {
    chainId: 1,
    intentSettler: env('NEXT_PUBLIC_ETH_SETTLER_ADDRESS'),
    solverAuction: env('NEXT_PUBLIC_ETH_SOLVER_AUCTION_ADDRESS'),
    chainPeerRegistry: env('NEXT_PUBLIC_ETH_CHAIN_PEER_REGISTRY_ADDRESS'),
  },
  // Base mainnet
  8453: {
    chainId: 8453,
    intentSettler: env('NEXT_PUBLIC_BASE_SETTLER_ADDRESS'),
    solverAuction: env('NEXT_PUBLIC_BASE_SOLVER_AUCTION_ADDRESS'),
    chainPeerRegistry: env('NEXT_PUBLIC_BASE_CHAIN_PEER_REGISTRY_ADDRESS'),
  },
  // Sepolia (Ethereum testnet)
  11155111: {
    chainId: 11155111,
    intentSettler: env('NEXT_PUBLIC_SEPOLIA_SETTLER_ADDRESS'),
    solverAuction: env('NEXT_PUBLIC_SEPOLIA_SOLVER_AUCTION_ADDRESS'),
    chainPeerRegistry: env('NEXT_PUBLIC_SEPOLIA_CHAIN_PEER_REGISTRY_ADDRESS'),
  },
  // Base Sepolia (Base testnet)
  84532: {
    chainId: 84532,
    intentSettler: env('NEXT_PUBLIC_BASE_SEPOLIA_SETTLER_ADDRESS'),
    solverAuction: env('NEXT_PUBLIC_BASE_SEPOLIA_SOLVER_AUCTION_ADDRESS'),
    chainPeerRegistry: env('NEXT_PUBLIC_BASE_SEPOLIA_CHAIN_PEER_REGISTRY_ADDRESS'),
  },
};

export function contractsFor(chainId: number): ChainContracts | undefined {
  return CONTRACTS_BY_CHAIN[chainId];
}

/** True when the chain has a real (non-zero) IntentSettler deployed. The
 *  frontend uses this to disable the Submit button on chains that aren't
 *  configured yet. */
export function isChainSupported(chainId: number): boolean {
  const c = CONTRACTS_BY_CHAIN[chainId];
  return c !== undefined && c.intentSettler !== ZERO_ADDR;
}

/** Native ETH / chain native asset is encoded as the zero address in the
 *  on-chain Intent struct. Helper to keep the convention consistent. */
export const NATIVE_TOKEN: `0x${string}` = ZERO_ADDR;
