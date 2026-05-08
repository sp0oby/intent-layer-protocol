import Link from 'next/link';
import type {ReactNode} from 'react';
import {Logo} from '@/components/Logo';
import {WalletButton} from '@/components/WalletButton';
import {NetworkBanner} from '@/components/NetworkBanner';

/**
 * Page chrome. Sticky glass header with the brand mark + wordmark on
 * the left, structured nav in the middle, and the wallet control on
 * the right. The header is full-bleed (max-w-7xl gutters) so the
 * landing's wider composition reads as a continuation of the chrome
 * rather than a separate canvas; routes that opt into a narrower
 * container do that themselves on /main.
 */
export function AppShell({children}: {children: ReactNode}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
          {/* Brand — full company wordmark, generous weight. The header
              is the canonical place for the name; downstream surfaces
              drop the brand to avoid stuttering. */}
          <Link
            href="/"
            className="group flex items-center gap-3"
            aria-label="Intent Layer Protocol — home"
          >
            <Logo size={30} className="text-foreground transition-transform group-hover:rotate-[-3deg]" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Intent Layer Protocol
            </span>
          </Link>

          {/* Centered nav. Hidden on small screens; the WalletButton
              handles primary action there. */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 md:flex"
          >
            <NavLink href="/swap">Swap</NavLink>
            <NavLink href="/history">History</NavLink>
            <NavLink
              href="https://github.com/sp0oby/intent-layer-protocol"
              external
            >
              Docs
            </NavLink>
          </nav>

          {/* Wallet control — already context-aware (Connect / address chip). */}
          <div className="flex items-center gap-2">
            <WalletButton />
          </div>
        </div>
      </header>
      <NetworkBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={18} className="text-muted-foreground/60" />
            <span>Phase 1 · Ethereum ↔ Base</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/swap" className="transition-colors hover:text-foreground">
              Swap
            </Link>
            <Link href="/history" className="transition-colors hover:text-foreground">
              History
            </Link>
            <a
              href="https://github.com/sp0oby/intent-layer-protocol/blob/main/docs/ARCHITECTURE.md"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Docs
            </a>
            <a
              href="https://github.com/sp0oby/intent-layer-protocol"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className =
    'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
