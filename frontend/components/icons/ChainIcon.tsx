import {base, baseSepolia, mainnet, sepolia} from 'wagmi/chains';

/**
 * Chain identity marks. Custom-drawn so they share design language with
 * the rest of the app and don't pull in a token-list image dependency.
 * The mainnet + testnet variants of each chain reuse the same mark with
 * an `(s)` subscript suffix added by the consumer's label, not here.
 */
export function ChainIcon({chainId, size = 24, className}: {chainId: number; size?: number; className?: string}) {
  const props = {width: size, height: size, viewBox: '0 0 24 24', className} as const;

  // Ethereum + Sepolia — same mark
  if (chainId === mainnet.id || chainId === sepolia.id) {
    return (
      <svg {...props} role="img" aria-label="Ethereum">
        <circle cx="12" cy="12" r="12" fill="oklch(0.42 0.08 270)" />
        <path d="M 12 4 L 17 12 L 12 14.5 L 7 12 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
        <path d="M 12 4 L 17 12 L 12 14.5 Z" fill="oklch(0.95 0.005 240)" opacity="0.7" />
        <path d="M 12 16 L 17 13 L 12 20 L 7 13 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
      </svg>
    );
  }

  // Base + Base Sepolia — same mark
  if (chainId === base.id || chainId === baseSepolia.id) {
    return (
      <svg {...props} role="img" aria-label="Base">
        <circle cx="12" cy="12" r="12" fill="oklch(0.55 0.20 250)" />
        {/* Stylised Base mark — partial circle with vertical cut, drawn as one path. */}
        <path
          d="M 12 4 a 8 8 0 1 0 0 16 a 8 8 0 0 1 0 -16 z"
          fill="oklch(0.97 0.005 240)"
        />
      </svg>
    );
  }

  // Local Anvil — Eth half (31337)
  if (chainId === 31337) {
    return (
      <svg {...props} role="img" aria-label="Anvil Eth">
        <circle cx="12" cy="12" r="12" fill="oklch(0.42 0.08 270)" />
        <path d="M 12 4 L 17 12 L 12 14.5 L 7 12 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
        <path d="M 12 4 L 17 12 L 12 14.5 Z" fill="oklch(0.95 0.005 240)" opacity="0.7" />
        <path d="M 12 16 L 17 13 L 12 20 L 7 13 Z" fill="oklch(0.95 0.005 240)" opacity="0.95" />
        <circle cx="20" cy="4" r="2.5" fill="oklch(0.78 0.16 60)" stroke="var(--color-card)" strokeWidth="1" />
      </svg>
    );
  }

  // Local Anvil — Base half (31338)
  if (chainId === 31338) {
    return (
      <svg {...props} role="img" aria-label="Anvil Base">
        <circle cx="12" cy="12" r="12" fill="oklch(0.55 0.20 250)" />
        <path d="M 12 4 a 8 8 0 1 0 0 16 a 8 8 0 0 1 0 -16 z" fill="oklch(0.97 0.005 240)" />
        <circle cx="20" cy="4" r="2.5" fill="oklch(0.78 0.16 60)" stroke="var(--color-card)" strokeWidth="1" />
      </svg>
    );
  }

  // Fallback — neutral disc with chain id underneath
  return (
    <svg {...props} role="img" aria-label={`Chain ${chainId}`}>
      <circle cx="12" cy="12" r="12" fill="var(--color-muted)" />
      <text x="12" y="14" textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--color-muted-foreground)">
        ?
      </text>
    </svg>
  );
}
