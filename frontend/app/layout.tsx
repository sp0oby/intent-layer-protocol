import type {Metadata} from 'next';
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

export const metadata: Metadata = {
  title: 'Intent Layer Protocol',
  description: 'Cross-chain intent matching — Ethereum ↔ Base.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
