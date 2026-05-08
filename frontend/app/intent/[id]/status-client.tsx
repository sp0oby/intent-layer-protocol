'use client';

import {useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight, Check} from 'lucide-react';
import {Skeleton} from '@/components/ui/skeleton';
import {AuctionCountdown} from '@/components/IntentStatusTimeline';
import {IntentActions} from '@/components/IntentActions';
import {RoutePreview, stateToActiveStep} from '@/components/RoutePreview';
import {TokenWithChainOverlay} from '@/components/TokenPickerDialog';
import {useIntent, useIntentProposals} from '@/hooks/useIntents';
import {useIntentStatus} from '@/hooks/useIntentStatus';
import {useNowSeconds} from '@/hooks/useNow';
import {chainShortName, txExplorerUrl} from '@/lib/chains';
import {formatTokenAmount, truncateAddress} from '@/lib/format';
import {findToken, type TokenSymbol} from '@/lib/tokens';
import type {IntentRecord, IntentState, ProposalRecord} from '@/lib/types';

/**
 * Status display for a single intent. Composition matches the swap
 * page's craft level: glass hero card with the send→receive visual
 * (token+chain chips, big mono amounts), a state pill that pulses
 * cyan while matching, the across-style RoutePreview block driven by
 * the intent's on-chain state, and a compact details grid below.
 *
 * Live data: useIntent owns the canonical REST snapshot; useIntentStatus
 * subscribes to the WebSocket and invalidates the query on StateChange
 * so the row re-fetches with the new state. The RoutePreview's
 * activeStep is derived synchronously from intent.state.
 */
export function IntentStatusClient({id}: {id: string}) {
  const isHash = id.startsWith('0x') && id.length === 66;
  const queryClient = useQueryClient();

  const {data: intent, isLoading, error} = useIntent(isHash ? id : undefined);
  useIntentStatus({
    intentHash: isHash ? id : undefined,
    onEvent: (event) => {
      if (event.type === 'StateChange' || event.type === 'IntentSubmitted') {
        queryClient.invalidateQueries({queryKey: ['intent', id]});
      }
    },
  });

  if (!isHash) {
    return (
      <NoticeCard tone="muted">
        Provide a 32-byte intent hash (0x… 64 hex chars). The submission flow
        routes here automatically after a real submitIntent call.
      </NoticeCard>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-8 space-y-5">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return <NoticeCard tone="error">{(error as Error).message}</NoticeCard>;
  }

  if (!intent) {
    return (
      <NoticeCard tone="muted">
        No intent with that hash yet — the indexer may still be observing the
        IntentSubmitted event.
      </NoticeCard>
    );
  }

  return (
    <div className="relative mt-6 space-y-5">
      {/* Soft halo pulled in from the swap card so /intent/[id] visually
          continues from /swap rather than feeling like a different app. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-16 -z-10 rounded-[40%] bg-[radial-gradient(ellipse_55%_50%_at_50%_50%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_70%)] blur-2xl"
      />

      <HeroCard intent={intent} />

      <RoutePreview
        sourceChainId={intent.sourceChainId}
        destChainId={intent.destChainId}
        sourceSymbol={inferSymbol(intent.sourceToken, intent.sourceChainId)}
        destSymbol={inferSymbol(intent.destToken, intent.destChainId)}
        activeStep={stateToActiveStep(intent.state)}
      />

      <AuctionCountdownCard
        state={intent.state}
        deadline={intent.auctionDeadline}
      />

      <IntentActions intent={intent} />

      <ProposalsCard intentHash={intent.intentHash} state={intent.state} minDestAmount={intent.minDestAmount} destToken={intent.destToken} destChainId={intent.destChainId} />

      <TxLinksCard intent={intent} />

      <DetailsCard intent={intent} />
    </div>
  );
}

/**
 * Auction countdown card — only renders while we're actually counting.
 * The state guard alone wasn't enough: backend left intents in
 * AUCTIONING after the deadline had passed (until the orchestrator
 * finalised), so the wrapper kept rendering an empty inner. Gate on
 * deadline > now too.
 */
function AuctionCountdownCard({
  state,
  deadline,
}: {
  state: IntentState;
  deadline: number | undefined;
}) {
  const nowSec = useNowSeconds(1_000);
  if (state !== 'AUCTIONING' || !deadline || deadline <= nowSec) return null;
  return (
    <div className="rounded-2xl bg-background/40 px-5 py-4 ring-1 ring-foreground/5">
      <AuctionCountdown deadline={deadline} />
    </div>
  );
}

function HeroCard({intent}: {intent: IntentRecord}) {
  const sourceLabel = formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId);
  const destLabel = formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId);

  const sourceSymbol = inferSymbol(intent.sourceToken, intent.sourceChainId);
  const destSymbol = inferSymbol(intent.destToken, intent.destChainId);

  return (
    <div className="overflow-hidden rounded-3xl bg-card/70 p-6 shadow-2xl shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur-2xl sm:p-7">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Intent</h1>
        <StatePill state={intent.state} />
      </header>
      <div className="mt-1 font-mono text-xs text-muted-foreground">
        {intent.intentHash.slice(0, 10)}…{intent.intentHash.slice(-8)}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SwapSide
          label="From"
          chainId={intent.sourceChainId}
          symbol={sourceSymbol}
          amountLabel={sourceLabel}
        />
        <SwapSide
          label="To · minimum"
          chainId={intent.destChainId}
          symbol={destSymbol}
          amountLabel={destLabel}
        />
      </div>
    </div>
  );
}

function SwapSide({
  label,
  chainId,
  symbol,
  amountLabel,
}: {
  label: string;
  chainId: number;
  symbol: TokenSymbol | undefined;
  amountLabel: string;
}) {
  // Split the formatTokenAmount output ("1.0 ETH") into amount + symbol
  // so we can render the amount mono and the symbol naturally.
  const [amountText, symbolText] = splitAmountLabel(amountLabel);
  return (
    <div className="rounded-2xl bg-background/40 p-5 ring-1 ring-foreground/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
          {label}
        </span>
        {symbol ? (
          <TokenWithChainOverlay symbol={symbol} chainId={chainId} size={28} />
        ) : null}
      </div>
      <div className="mt-3 font-mono text-3xl font-medium tabular-nums tracking-tight text-foreground">
        {amountText}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {symbolText} on {chainShortName(chainId)}
      </div>
    </div>
  );
}

function StatePill({state}: {state: IntentState}) {
  const tone = stateTone(state);
  const label = stateLabel(state);
  const cls =
    tone === 'active'
      ? 'bg-primary/10 text-primary ring-primary/40'
      : tone === 'success'
        ? 'bg-foreground/[0.06] text-foreground ring-foreground/15'
        : 'bg-foreground/[0.04] text-muted-foreground ring-foreground/10';
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ' +
        cls
      }
    >
      {tone === 'active' ? (
        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
      ) : null}
      {label}
    </span>
  );
}

/**
 * Solver bidding feed. Polls /api/intents/:hash/proposals every 3s
 * (server-side enforced) and surfaces who's bid, at what amount, and
 * who's been announced as the winner. Visible whenever there's at
 * least one proposal — the auction window opens before any bid lands,
 * so we don't gate on state alone (the AUCTIONING state can pre-date
 * the first bid by a few seconds).
 *
 * Each row reads "solver · bid · fee · winner mark" and the rows
 * order oldest-first to read like a chronological auction log.
 */
function ProposalsCard({
  intentHash,
  state,
  minDestAmount,
  destToken,
  destChainId,
}: {
  intentHash: string;
  state: IntentState;
  minDestAmount: string;
  destToken: string;
  destChainId: number;
}) {
  const {data} = useIntentProposals(intentHash);
  const proposals = data ?? [];

  // Hide entirely on terminal states with no bids — keeps the card
  // from showing up empty on intents that never went to auction.
  const interesting = ['AUCTIONING', 'MATCHED', 'LOCKED', 'SETTLED'];
  if (proposals.length === 0 && !interesting.includes(state)) return null;
  if (proposals.length === 0 && state !== 'AUCTIONING') return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-background/40 ring-1 ring-foreground/5">
      <header className="flex items-center justify-between border-b border-foreground/5 px-5 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Solver bids · {proposals.length}
        </span>
        {state === 'AUCTIONING' ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
            Auction open
          </span>
        ) : null}
      </header>
      {proposals.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">
          Awaiting first proposal…
        </p>
      ) : (
        <ul className="divide-y divide-foreground/5">
          {proposals.map((p) => (
            <ProposalRow
              key={`${p.solver}-${p.proposedOutputAmount}`}
              proposal={p}
              minDestAmount={minDestAmount}
              destToken={destToken}
              destChainId={destChainId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProposalRow({
  proposal,
  minDestAmount,
  destToken,
  destChainId,
}: {
  proposal: ProposalRecord;
  minDestAmount: string;
  destToken: string;
  destChainId: number;
}) {
  const bidLabel = formatTokenAmount(proposal.proposedOutputAmount, destToken, destChainId);
  // Difference vs user's floor — informative for the solver UX. Skipped
  // when amounts can't be parsed (unknown token).
  let above = '';
  try {
    const min = BigInt(minDestAmount);
    const bidWei = BigInt(proposal.proposedOutputAmount);
    if (bidWei > min && min > 0n) {
      const overBps = Number(((bidWei - min) * 10_000n) / min);
      above = ` (+${(overBps / 100).toFixed(2)}% over floor)`;
    }
  } catch {
    // Non-fatal — leave above empty.
  }
  return (
    <li className="grid grid-cols-12 items-center gap-3 px-5 py-3">
      <div className="col-span-7 sm:col-span-5">
        <div className="font-mono text-xs text-foreground">
          {truncateAddress(proposal.solver)}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          fee {(proposal.solverFeeBps / 100).toFixed(2)}%
        </div>
      </div>
      <div className="col-span-5 hidden font-mono text-xs tabular-nums text-foreground sm:col-span-5 sm:block">
        {bidLabel}
        <span className="text-muted-foreground">{above}</span>
      </div>
      <div className="col-span-5 text-right sm:col-span-2">
        {proposal.winnerAnnounced ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary ring-1 ring-primary/40">
            <Check className="size-3" aria-hidden="true" />
            Winner
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Pending
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Block-explorer chips for every tx hash the indexer has stamped on
 * this intent. Hides chips that have no value yet (state hasn't been
 * reached) and grays chips on chains with no public explorer (local
 * Anvil) — those just show the truncated hash as text.
 */
function TxLinksCard({intent}: {intent: IntentRecord}) {
  const links: Array<{label: string; chainId: number; hash: string | undefined}> = [
    {label: 'Submit', chainId: intent.sourceChainId, hash: intent.submitTxHash},
    {label: 'Match', chainId: intent.sourceChainId, hash: intent.matchTxHash},
    {label: 'Settle', chainId: intent.destChainId, hash: intent.settleTxHash},
    {label: 'Cancel', chainId: intent.sourceChainId, hash: intent.cancelTxHash},
    {label: 'Refund', chainId: intent.sourceChainId, hash: intent.refundTxHash},
  ];
  const present = links.filter((l) => l.hash);
  if (present.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl bg-background/40 ring-1 ring-foreground/5">
      <header className="border-b border-foreground/5 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Transactions
      </header>
      <ul className="flex flex-wrap gap-2 px-5 py-4">
        {present.map((l) => (
          <li key={l.label}>
            <TxChip label={l.label} chainId={l.chainId} hash={l.hash as string} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TxChip({label, chainId, hash}: {label: string; chainId: number; hash: string}) {
  const url = txExplorerUrl(chainId, hash);
  const truncated = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 px-2.5 py-1 text-xs ring-1 ring-foreground/10">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-muted-foreground">{truncated}</span>
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-1.5 rounded-full bg-card/80 px-2.5 py-1 text-xs ring-1 ring-foreground/10 transition-colors hover:bg-card hover:ring-primary/40"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-foreground">{truncated}</span>
      <ArrowUpRight className="size-3 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />
    </a>
  );
}

function DetailsCard({intent}: {intent: IntentRecord}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-background/40 ring-1 ring-foreground/5">
      <header className="border-b border-foreground/5 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Details
      </header>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-5 text-sm sm:grid-cols-2">
        <Row label="User" value={truncateAddress(intent.user)} mono />
        <Row label="Refund to" value={truncateAddress(intent.refundTo)} mono />
        <Row label="Deadline" value={new Date(intent.deadline * 1000).toLocaleString()} />
        <Row label="Nonce" value={intent.nonce} mono />
      </dl>
    </section>
  );
}

function Row({label, value, mono}: {label: string; value: string; mono?: boolean}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className={'mt-1 ' + (mono ? 'font-mono text-xs text-foreground' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  );
}

function NoticeCard({children, tone}: {children: React.ReactNode; tone: 'muted' | 'error'}) {
  return (
    <div className="mt-8 rounded-2xl bg-card/60 px-5 py-4 ring-1 ring-foreground/10 backdrop-blur-md">
      <p className={'text-sm ' + (tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
        {children}
      </p>
    </div>
  );
}

function inferSymbol(addr: string, chainId: number): TokenSymbol | undefined {
  const lower = addr.toLowerCase();
  for (const symbol of ['ETH', 'USDC', 'USDT'] as const) {
    const token = findToken(chainId, symbol);
    if (token && token.address.toLowerCase() === lower) return symbol;
  }
  return undefined;
}

function splitAmountLabel(label: string): [string, string] {
  // formatTokenAmount returns either "1.0 ETH" or "<wei> (0x123…)" for
  // unknown tokens. Split on the first space — fallback returns whole
  // label as amount, empty symbol.
  const idx = label.indexOf(' ');
  if (idx === -1) return [label, ''];
  return [label.slice(0, idx), label.slice(idx + 1)];
}

function stateTone(state: IntentState): 'muted' | 'active' | 'success' {
  if (state === 'PENDING' || state === 'AUCTIONING' || state === 'MATCHED' || state === 'LOCKED') {
    return 'active';
  }
  if (state === 'SETTLED') return 'success';
  return 'muted';
}

function stateLabel(state: IntentState): string {
  switch (state) {
    case 'PENDING':
      return 'Pending match';
    case 'AUCTIONING':
      return 'Auction open';
    case 'MATCHED':
      return 'Matched';
    case 'LOCKED':
      return 'Settling';
    case 'SETTLED':
      return 'Settled';
    case 'CANCELLED':
      return 'Cancelled';
    case 'REFUNDED':
      return 'Refunded';
  }
}
