import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';

/**
 * History route placeholder. The real list (paginated by connected
 * wallet, filtered by chain) ships in Stage 5.4 once the backend's
 * `GET /api/intents?user=…` endpoint lands.
 */
export default function HistoryPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-2xl">History</CardTitle>
          <CardDescription>
            Your past intents — pending, settled, and refunded — once Stage 5.4 lands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </section>
  );
}
