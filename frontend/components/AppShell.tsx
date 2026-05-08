import Link from 'next/link';
import type {ReactNode} from 'react';
import {WalletButton} from '@/components/WalletButton';
import {NetworkBanner} from '@/components/NetworkBanner';

/**
 * Page chrome that wraps every route. Sticky glass header with the
 * wordmark, primary nav, and wallet button. Network-mismatch banner
 * mounts directly under it when applicable. Footer is intentionally
 * thin — the layout's atmospheric backdrop carries the brand.
 */
export function AppShell({children}: {children: ReactNode}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link
            href="/"
            className="group flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            {/* Wordmark + tiny dot until the real mark lands. The dot picks up
                the primary cyan so the header has one accent flick. */}
            <span
              className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)] transition-transform group-hover:scale-125"
              aria-hidden="true"
            />
            Intent Layer
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <Link
              href="/swap"
              className="font-medium transition-colors hover:text-foreground"
            >
              Swap
            </Link>
            <Link
              href="/history"
              className="font-medium transition-colors hover:text-foreground"
            >
              History
            </Link>
          </nav>
          <WalletButton />
        </div>
      </header>
      <NetworkBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
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
