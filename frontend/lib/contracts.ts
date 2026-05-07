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

const envWithDefault = (name: string, defaultAddr: `0x${string}`): `0x${string}` => {
  const value = process.env[name];
  return (value ?? defaultAddr) as `0x${string}`;
};

// Local Anvil deterministic deploy addresses — match the nonce sequence
// in backend/tests/e2e/helpers/deploy-stack.ts. Override any of these
// via NEXT_PUBLIC_LOCAL_*_ADDRESS env when running a custom deploy.
const LOCAL_INTENT_SETTLER = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as const;
const LOCAL_SOLVER_AUCTION = '0x0165878A594ca255338adfa4d48449f69242Eb8F' as const;
const LOCAL_CHAIN_PEER_REGISTRY = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as const;

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
  // Local Anvil — Eth half (matches Stage 4 E2E ETH_CHAIN_ID 31337).
  // Defaults are the deterministic deploy-stack.ts addresses; override
  // via NEXT_PUBLIC_LOCAL_ETH_*_ADDRESS for custom deploys.
  31337: {
    chainId: 31337,
    intentSettler: envWithDefault('NEXT_PUBLIC_LOCAL_ETH_SETTLER_ADDRESS', LOCAL_INTENT_SETTLER),
    solverAuction: envWithDefault('NEXT_PUBLIC_LOCAL_ETH_SOLVER_AUCTION_ADDRESS', LOCAL_SOLVER_AUCTION),
    chainPeerRegistry: envWithDefault(
      'NEXT_PUBLIC_LOCAL_ETH_CHAIN_PEER_REGISTRY_ADDRESS',
      LOCAL_CHAIN_PEER_REGISTRY
    ),
  },
  // Local Anvil — Base half (matches Stage 4 E2E BASE_CHAIN_ID 31338).
  31338: {
    chainId: 31338,
    intentSettler: envWithDefault('NEXT_PUBLIC_LOCAL_BASE_SETTLER_ADDRESS', LOCAL_INTENT_SETTLER),
    solverAuction: envWithDefault('NEXT_PUBLIC_LOCAL_BASE_SOLVER_AUCTION_ADDRESS', LOCAL_SOLVER_AUCTION),
    chainPeerRegistry: envWithDefault(
      'NEXT_PUBLIC_LOCAL_BASE_CHAIN_PEER_REGISTRY_ADDRESS',
      LOCAL_CHAIN_PEER_REGISTRY
    ),
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
