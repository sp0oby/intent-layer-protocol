import Link from 'next/link';
import {IntentStatusClient} from './status-client';

// Next 16 made dynamic-route `params` a Promise — must be awaited inside
// an async server component. The previous synchronous destructure gave
// us `id === undefined` at runtime.
type PageProps = {params: Promise<{id: string}>};

export default async function IntentStatusPage({params}: PageProps) {
  const {id} = await params;
  return (
    <section className="mx-auto max-w-xl px-6 py-12">
      <Link
        href="/swap"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to swap
      </Link>
      <IntentStatusClient id={id} />
    </section>
  );
}
