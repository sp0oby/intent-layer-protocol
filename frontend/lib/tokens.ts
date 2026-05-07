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
};

export function tokensForChain(chainId: number | undefined): Token[] {
  if (!isSupportedChain(chainId)) return [];
  return TOKENS_BY_CHAIN[chainId];
}

/** The opposite chain in the same Phase 1 corridor (mainnet ↔ mainnet,
 *  testnet ↔ testnet). Returns undefined for unsupported chains. */
export function partnerChainOf(chainId: number | undefined): SupportedChainId | undefined {
  if (chainId === 1) return 8453;
  if (chainId === 8453) return 1;
  if (chainId === 11155111) return 84532;
  if (chainId === 84532) return 11155111;
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
