'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {useChainId, useConnection, useWaitForTransactionReceipt, useWriteContract} from 'wagmi';
import {Button} from '@/components/ui/button';
import {contractsFor, IntentSettlerAbi} from '@/lib/contracts';
import {useNowSeconds} from '@/hooks/useNow';
import type {IntentRecord, IntentState} from '@/lib/types';

/** Time after match before refundIfLzTimeout becomes callable. Mirrors
 *  IntentSettler.LZ_TIMEOUT (6 hours, in seconds). */
const LZ_TIMEOUT_SEC = 6 * 60 * 60;

/**
 * Action buttons that appear under the status timeline:
 *
 *   Cancel  — visible when state ∈ {PENDING, AUCTIONING} and the
 *             connected wallet is intent.user. Calls
 *             IntentSettler.cancelIntent(hash).
 *
 *   Refund  — visible when state === MATCHED and (now - matchTimestamp)
 *             ≥ LZ_TIMEOUT (6 h). Anyone can call refundIfLzTimeout
 *             on a stuck intent — we still gate the button on user ===
 *             intent.user since refunding someone else's intent is a
 *             concern only the owner cares about.
 *
 * Both actions revalidate the parent's `useIntent` query via the
 * WebSocket push — the indexer's IntentCancelled / IntentRefunded
 * handler emits a StateChange event the page is already subscribed to.
 */
export function IntentActions({intent}: {intent: IntentRecord}) {
  const {address, isConnected} = useConnection();
  const chainId = useChainId();
  const router = useRouter();

  const isOwner =
    isConnected && address && address.toLowerCase() === intent.user.toLowerCase();
  const onSourceChain = chainId === intent.sourceChainId;

  const settlerAddress = contractsFor(intent.sourceChainId)?.intentSettler;
  const settlerConfigured = settlerAddress !== undefined && !/^0x0+$/.test(settlerAddress);

  const cancelable: ReadonlyArray<IntentState> = ['PENDING', 'AUCTIONING'];
  const showCancel = isOwner && onSourceChain && settlerConfigured && cancelable.includes(intent.state);

  const matchedAt = intent.matchTimestamp ?? 0;
  // 60-second tick is plenty for "has 6h elapsed?" — saves re-rendering
  // every second on a status page that's mostly static.
  const nowSec = useNowSeconds(60_000);
  const lzWindowOpen =
    intent.state === 'MATCHED' && matchedAt > 0 && nowSec >= matchedAt + LZ_TIMEOUT_SEC;
  const showRefund = isOwner && onSourceChain && settlerConfigured && lzWindowOpen;

  if (!showCancel && !showRefund) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showCancel ? (
        <CancelButton
          intentHash={intent.intentHash}
          settlerAddress={settlerAddress as `0x${string}`}
          chainId={intent.sourceChainId}
          onSuccess={() => router.refresh()}
        />
      ) : null}
      {showRefund ? (
        <RefundButton
          intentHash={intent.intentHash}
          settlerAddress={settlerAddress as `0x${string}`}
          chainId={intent.sourceChainId}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

interface ActionProps {
  intentHash: string;
  settlerAddress: `0x${string}`;
  chainId: number;
  onSuccess: () => void;
}

function CancelButton({intentHash, settlerAddress, chainId, onSuccess}: ActionProps) {
  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash: tx.data, chainId});

  useEffect(() => {
    if (tx.error) toast.error(tx.error.message);
  }, [tx.error]);
  useEffect(() => {
    if (receipt.data) {
      toast.success('Intent cancelled');
      onSuccess();
    }
  }, [receipt.data, onSuccess]);

  if (receipt.isLoading) {
    return (
      <Button variant="outline" disabled>
        Cancelling…
      </Button>
    );
  }
  if (tx.isPending) {
    return (
      <Button variant="outline" disabled>
        Confirm in wallet
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={() =>
        tx.writeContract({
          address: settlerAddress,
          abi: IntentSettlerAbi,
          functionName: 'cancelIntent',
          args: [intentHash as `0x${string}`],
          chainId,
        })
      }
    >
      Cancel intent
    </Button>
  );
}

function RefundButton({intentHash, settlerAddress, chainId, onSuccess}: ActionProps) {
  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash: tx.data, chainId});

  useEffect(() => {
    if (tx.error) toast.error(tx.error.message);
  }, [tx.error]);
  useEffect(() => {
    if (receipt.data) {
      toast.success('Refund landed');
      onSuccess();
    }
  }, [receipt.data, onSuccess]);

  if (receipt.isLoading) {
    return (
      <Button variant="outline" disabled>
        Refunding…
      </Button>
    );
  }
  if (tx.isPending) {
    return (
      <Button variant="outline" disabled>
        Confirm in wallet
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={() =>
        tx.writeContract({
          address: settlerAddress,
          abi: IntentSettlerAbi,
          functionName: 'refundIfLzTimeout',
          args: [intentHash as `0x${string}`],
          chainId,
        })
      }
    >
      Refund (LZ timeout)
    </Button>
  );
}
