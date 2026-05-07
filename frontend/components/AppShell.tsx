import Link from 'next/link';
import type {ReactNode} from 'react';
import {WalletButton} from '@/components/WalletButton';
import {NetworkBanner} from '@/components/NetworkBanner';

/**
 * Page chrome that wraps every route — header with logo placeholder,
 * primary nav, wallet button on the right; network-mismatch banner just
 * below the header when relevant. Footer kept minimal until brand /
 * marketing decisions land.
 *
 * Wireframe phase: pure b&w. Logo is a text wordmark; replace with the
 * real mark once branding is signed off.
 */
export function AppShell({children}: {children: ReactNode}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Intent Layer
          </Link>
          <nav className="hidden gap-5 text-sm text-muted-foreground sm:flex">
            <Link href="/swap" className="transition-colors hover:text-foreground">
              Swap
            </Link>
            <Link href="/history" className="transition-colors hover:text-foreground">
              History
            </Link>
          </nav>
          <WalletButton />
        </div>
      </header>
      <NetworkBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>Intent Layer Protocol — Phase 1</span>
          <a
            href="https://github.com/sp0oby/intent-layer-protocol"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
