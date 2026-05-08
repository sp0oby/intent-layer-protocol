import type {Metadata, Viewport} from 'next';
import localFont from 'next/font/local';
import './globals.css';
import {Providers} from './providers';
import {AppShell} from '@/components/AppShell';
import {Toaster} from '@/components/ui/sonner';

// Geist VF + GeistMono are vendored under app/fonts/ — no Google Fonts
// dependency at runtime. Variables are referenced by Tailwind via the
// --font-sans / --font-mono custom-property exposed in globals.css.
const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

/**
 * Per-page titles inherit the template ("%s · Intent Layer Protocol").
 * Pages that need a dynamic title (e.g. /intent/[id]) export their own
 * `generateMetadata` override; pages that only need a sub-title export
 * a `metadata.title` string and the template formats it automatically.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://intentlayer.io'),
  title: {
    default: 'Intent Layer Protocol',
    template: '%s · Intent Layer Protocol',
  },
  description:
    'Cross-chain intent settlement. Match peer-to-peer across Ethereum and Base with bonded solver auction as fallback. No bridges. No solver margin when a real counterparty is on the other side.',
  applicationName: 'Intent Layer Protocol',
  keywords: [
    'cross-chain swap',
    'intent settlement',
    'ethereum',
    'base',
    'layerzero',
    'p2p swap',
    'defi',
  ],
  robots: {index: true, follow: true},
  openGraph: {
    type: 'website',
    siteName: 'Intent Layer Protocol',
    title: 'Intent Layer Protocol',
    description: 'Cross-chain swaps, settled directly between users.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Intent Layer Protocol',
    description: 'Cross-chain swaps, settled directly between users.',
  },
};

/** Next 16 wants `themeColor` and `colorScheme` on a separate `viewport`
 *  export rather than inside `metadata`. Splitting it out silences the
 *  build warning and keeps the dark navbar tinting on iOS Safari. */
export const viewport: Viewport = {
  themeColor: '#0a1633',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
