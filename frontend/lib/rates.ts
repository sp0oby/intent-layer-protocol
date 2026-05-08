/**
 * Indicative rate stand-in. NOT a real price feed — these are static
 * USD values that let the swap form auto-compute an expected output
 * from a single source-amount input. The form's `Min receive` is then
 * `expected × (1 - slippage)` and that's what we submit on-chain as
 * the user's `minDestAmount` floor.
 *
 * Replace before mainnet:
 *   - For mainnet/L2s: wire Chainlink price feeds (`getRoundData`) or a
 *     CoinGecko fetch through a proxy.
 *   - For local/Sepolia: keep this file but expose an env override so
 *     the dev harness can poke values without redeploying frontends.
 *
 * Floats are fine here — these numbers exist only to suggest a UI
 * default; the real on-chain math always parses through viem
 * parseUnits / formatUnits.
 */

import type {TokenSymbol} from './tokens';

const INDICATIVE_USD: Record<TokenSymbol, number> = {
  ETH: 3000,
  USDC: 1,
  USDT: 1,
};

/** Source → destination ratio at the indicative rate. e.g.
 *  `indicativeRate('ETH', 'USDC')` returns 3000 (1 ETH = 3000 USDC). */
export function indicativeRate(srcSymbol: TokenSymbol, dstSymbol: TokenSymbol): number {
  const src = INDICATIVE_USD[srcSymbol];
  const dst = INDICATIVE_USD[dstSymbol];
  if (!src || !dst) return NaN;
  return src / dst;
}

/** Expected destination amount given a source amount string. Returns
 *  null when the input doesn't parse to a positive number, or the pair
 *  isn't priced. The form renders a placeholder in that case. */
export function expectedDestAmount(
  sourceAmount: string,
  srcSymbol: TokenSymbol,
  dstSymbol: TokenSymbol
): number | null {
  const src = parseFloat(sourceAmount);
  if (!isFinite(src) || src <= 0) return null;
  const rate = indicativeRate(srcSymbol, dstSymbol);
  if (!isFinite(rate)) return null;
  return src * rate;
}

/** Apply slippage tolerance (in basis points) — `applySlippage(100, 50)`
 *  with 50bps slippage returns 99.5. */
export function applySlippage(amount: number, slippageBps: number): number {
  return (amount * (10_000 - slippageBps)) / 10_000;
}

/** Compact decimal display for swap-card amounts. Tabular-clean: no
 *  thousands separators below 1, generous fractional digits for sub-1
 *  values, two fractional digits otherwise.
 *
 *  Returns the empty string when amount is null so the input field
 *  shows its placeholder instead of `NaN` or `0`. */
export function formatExpected(amount: number | null): string {
  if (amount === null) return '';
  if (!isFinite(amount)) return '';
  if (amount === 0) return '0';
  if (amount >= 1000) return amount.toLocaleString(undefined, {maximumFractionDigits: 2});
  if (amount >= 1) return amount.toLocaleString(undefined, {maximumFractionDigits: 4});
  if (amount >= 0.0001) return amount.toFixed(6);
  return amount.toExponential(3);
}

/** The slippage options the form exposes. Centralised here so the
 *  pill row and the default initial state read from the same source. */
export const SLIPPAGE_OPTIONS_BPS: ReadonlyArray<number> = [10, 50, 100];
export const DEFAULT_SLIPPAGE_BPS = 50;
