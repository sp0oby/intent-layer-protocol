import type {TokenSymbol} from '@/lib/tokens';

/**
 * Token marks. Hand-drawn approximations of well-known token brands —
 * close enough to read instantly, distinct enough to share design
 * language with the chain icons. ETH reuses the chain mark since they
 * are visually the same asset.
 */
export function TokenIcon({symbol, size = 24, className}: {symbol: TokenSymbol; size?: number; className?: string}) {
  const props = {width: size, height: size, viewBox: '0 0 24 24', className} as const;

  if (symbol === 'ETH') {
    return (
      <svg {...props} role="img" aria-label="Ether">
        <circle cx="12" cy="12" r="12" fill="oklch(0.42 0.08 270)" />
        <path d="M 12 4 L 17 12 L 12 14.5 L 7 12 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
        <path d="M 12 4 L 17 12 L 12 14.5 Z" fill="oklch(0.95 0.005 240)" opacity="0.7" />
        <path d="M 12 16 L 17 13 L 12 20 L 7 13 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
      </svg>
    );
  }

  if (symbol === 'USDC') {
    return (
      <svg {...props} role="img" aria-label="USDC">
        <circle cx="12" cy="12" r="12" fill="oklch(0.6 0.18 245)" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui"
          fill="oklch(0.97 0.005 240)"
        >
          $
        </text>
      </svg>
    );
  }

  if (symbol === 'USDT') {
    return (
      <svg {...props} role="img" aria-label="USDT">
        <circle cx="12" cy="12" r="12" fill="oklch(0.62 0.16 165)" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui"
          fill="oklch(0.97 0.005 240)"
        >
          ₮
        </text>
      </svg>
    );
  }

  return (
    <svg {...props} role="img" aria-label={symbol}>
      <circle cx="12" cy="12" r="12" fill="var(--color-muted)" />
    </svg>
  );
}
