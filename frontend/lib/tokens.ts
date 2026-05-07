/**
 * Phase 1 token registry. Hard-coded for now — every supported chain
 * lists its ETH/USDC/USDT addresses + decimals so the form can build a
 * valid Intent struct without an external token-list service.
 *
 * Future: pull from a token-list API (e.g. Coingecko) once the brand
 * decisions land and the form UX includes search.
 *
 * Native ETH is encoded as the zero address per the contract convention
 * (lib/contracts.ts NATIVE_TOKEN). Tokens here use a stable internal
 * `id` (`ETH` / `USDC` / `USDT`) so the UI can pair source + dest
 * tokens across chains by matching id.
 */

import {NATIVE_TOKEN} from './contracts';
import {SUPPORTED_CHAIN_IDS, isSupportedChain, type SupportedChainId} from './chains';

export type TokenSymbol = 'ETH' | 'USDC' | 'USDT';

export interface Token {
  symbol: TokenSymbol;
  /** Per-chain ERC-20 address. ETH (native) uses the zero address. */
  address: `0x${string}`;
  decimals: number;
  /** Human-readable name shown in the picker. */
  name: string;
  /** Whether this row is the chain's native asset (skips approval). */
  isNative: boolean;
}

const ETH = (): Token => ({
  symbol: 'ETH',
  address: NATIVE_TOKEN,
  decimals: 18,
  name: 'Ether',
  isNative: true,
});

// Mainnet addresses come from the canonical token deployments. Sepolia /
// Base Sepolia use the testnet faucets' canonical ERC-20 mocks. Update
// the testnet rows when the actual deployed addresses are confirmed in
// Stage 8 — these are placeholders so the form has something to bind to
// for local Anvil runs.
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_ETHEREUM = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Sepolia / Base Sepolia placeholder ERC-20 addresses — replace after Stage 8 deploy.
const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Local Anvil — addresses are deterministic when the Stage 4 deploy
// script (backend/tests/e2e/helpers/deploy-stack.ts) runs against a
// freshly-spawned Anvil. The script's nonce sequence:
//   nonce 0  → MockLzEndpoint
//   nonce 1  → ChainPeerRegistry
//   nonces 2, 3 → registry config calls
//   nonce 4  → IntentSettler        (used by lib/contracts.ts)
//   nonce 5  → registerOApp call
//   nonce 6  → SolverAuction        (used by lib/contracts.ts)
//   nonce 7  → setSolverAuction call
//   nonce 8  → MockERC20 USDC       (this address)
// Both Anvils run the same script from the same deployer so the values
// are identical on chain 31337 and chain 31338. Override either via
// NEXT_PUBLIC_LOCAL_USDC_ADDRESS if running a custom deploy.
const USDC_LOCAL_ANVIL = (process.env.NEXT_PUBLIC_LOCAL_USDC_ADDRESS ??
  '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6') as `0x${string}`;

const TOKENS_BY_CHAIN: Record<SupportedChainId, Token[]> = {
  // Ethereum mainnet — chain id 1
  1: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_ETHEREUM as `0x${string}`,
      decimals: 6,
      name: 'USD Coin',
      isNative: false,
    },
    {
      symbol: 'USDT',
      address: USDT_ETHEREUM as `0x${string}`,
      decimals: 6,
      name: 'Tether USD',
      isNative: false,
    },
  ],
  // Base mainnet — chain id 8453
  8453: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_BASE as `0x${string}`,
      decimals: 6,
      name: 'USD Coin',
      isNative: false,
    },
  ],
  // Ethereum Sepolia — chain id 11155111
  11155111: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_SEPOLIA as `0x${string}`,
      decimals: 6,
      name: 'USD Coin (Sepolia)',
      isNative: false,
    },
  ],
  // Base Sepolia — chain id 84532
  84532: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_BASE_SEPOLIA as `0x${string}`,
      decimals: 6,
      name: 'USD Coin (Base Sepolia)',
      isNative: false,
    },
  ],
  // Local Anvil — Eth half (matches Stage 4 E2E `ETH_CHAIN_ID = 31337`)
  31337: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_LOCAL_ANVIL,
      decimals: 6,
      name: 'USDC (Local Anvil)',
      isNative: false,
    },
  ],
  // Local Anvil — Base half (matches Stage 4 E2E `BASE_CHAIN_ID = 31338`)
  31338: [
    ETH(),
    {
      symbol: 'USDC',
      address: USDC_LOCAL_ANVIL,
      decimals: 6,
      name: 'USDC (Local Anvil)',
      isNative: false,
    },
  ],
};

export function tokensForChain(chainId: number | undefined): Token[] {
  if (!isSupportedChain(chainId)) return [];
  return TOKENS_BY_CHAIN[chainId];
}

/** The opposite chain in the same Phase 1 corridor (mainnet ↔ mainnet,
 *  testnet ↔ testnet, local Anvil pair ↔ each other). Returns undefined
 *  for unsupported chains. */
export function partnerChainOf(chainId: number | undefined): SupportedChainId | undefined {
  if (chainId === 1) return 8453;
  if (chainId === 8453) return 1;
  if (chainId === 11155111) return 84532;
  if (chainId === 84532) return 11155111;
  if (chainId === 31337) return 31338;
  if (chainId === 31338) return 31337;
  return undefined;
}

/** Look up a token by symbol on a chain. Returns undefined when the
 *  chain doesn't list that symbol (e.g. USDT on Base). */
export function findToken(chainId: number | undefined, symbol: TokenSymbol): Token | undefined {
  return tokensForChain(chainId).find((t) => t.symbol === symbol);
}

/** Quick sanity check used by the form: do both chains list the
 *  requested pair? Surfaces a friendly error before signing. */
export function tokenAvailableOnBothChains(
  sourceChainId: number,
  destChainId: number,
  sourceSymbol: TokenSymbol,
  destSymbol: TokenSymbol
): boolean {
  return (
    findToken(sourceChainId, sourceSymbol) !== undefined &&
    findToken(destChainId, destSymbol) !== undefined
  );
}

export {SUPPORTED_CHAIN_IDS};
