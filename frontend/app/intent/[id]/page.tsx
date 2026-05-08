import type {Metadata} from 'next';
import Link from 'next/link';
import {IntentStatusClient} from './status-client';

// Next 16 made dynamic-route `params` a Promise — must be awaited inside
// an async server component. The previous synchronous destructure gave
// us `id === undefined` at runtime.
type PageProps = {params: Promise<{id: string}>};

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {id} = await params;
  const isHash = id.startsWith('0x') && id.length === 66;
  const short = isHash ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
  return {
    title: `Intent ${short}`,
    description: `Live status for intent ${short} on the Intent Layer Protocol.`,
  };
}

export default async function IntentStatusPage({params}: PageProps) {
  const {id} = await params;
  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <Link
        href="/history"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← All intents
      </Link>
      <IntentStatusClient id={id} />
    </section>
  );
}
