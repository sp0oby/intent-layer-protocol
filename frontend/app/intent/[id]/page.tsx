import Link from 'next/link';
import {IntentStatusClient} from './status-client';

type PageProps = {params: {id: string}};

export default function IntentStatusPage({params}: PageProps) {
  return (
    <div className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Link href="/swap" className="text-sm text-neutral-500 hover:underline">
        ← Back to swap
      </Link>
      <IntentStatusClient id={params.id} />
    </div>
  );
}
