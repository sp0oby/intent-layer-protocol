'use client';

import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {decodeEventLog, parseUnits, type Hash, type Log} from 'viem';
import {useChainId, useConnection, useReadContract, useSwitchChain, useWriteContract} from 'wagmi';
import {useWaitForTransactionReceipt} from 'wagmi';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {WalletPickerDialog} from '@/components/WalletPickerDialog';
import {chainShortName, isSupportedChain} from '@/lib/chains';
import {contractsFor, IntentSettlerAbi} from '@/lib/contracts';
import {erc20Abi} from '@/lib/erc20-abi';
import type {Token} from '@/lib/tokens';

interface Props {
  sourceChainId: number | undefined;
  destChainId: number | undefined;
  sourceToken: Token | undefined;
  destToken: Token | undefined;
  sourceAmount: string;
  minDestAmount: string;
  deadlineMinutes: number;
}

/**
 * The single submit button drives the full intent submission flow:
 *
 *   Disconnected           → "Connect wallet" (opens picker)
 *   Unsupported chain      → "Switch to Ethereum" / "Switch to Base"
 *   Form invalid           → "Enter an amount" / etc. (disabled)
 *   ERC-20 needs approval  → "Approve {SYMBOL}" → calls erc20.approve
 *   Approve pending        → "Approving…"
 *   Ready                  → "Submit intent" → calls IntentSettler.submitIntent
 *   Submit pending         → "Submitting…"
 *   Mined                  → router.push(`/intent/${intentHash}`)
 *
 * State lives in three wagmi hooks (allowance, approve, submit) plus a
 * tiny local enum tracking the high-level phase. Errors surface via
 * sonner so the button itself stays clean.
 */
export function SubmitIntentButton({
  sourceChainId,
  destChainId,
  sourceToken,
  destToken,
  sourceAmount,
  minDestAmount,
  deadlineMinutes,
}: Props) {
  const router = useRouter();
  const {address, isConnected} = useConnection();
  const connectedChainId = useChainId();
  const {switchChain, isPending: switchPending} = useSwitchChain();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Parse decimal strings to bigint up-front so the validation block
  // and the submit handler work from the same numbers.
  const parsed = useMemo(() => {
    if (!sourceToken || !destToken) return null;
    if (!sourceAmount || !minDestAmount) return null;
    try {
      return {
        sourceAmountWei: parseUnits(sourceAmount, sourceToken.decimals),
        minDestAmountWei: parseUnits(minDestAmount, destToken.decimals),
      };
    } catch {
      return null;
    }
  }, [sourceToken, destToken, sourceAmount, minDestAmount]);

  const settlerAddress = useMemo(
    () => (sourceChainId ? contractsFor(sourceChainId)?.intentSettler : undefined),
    [sourceChainId]
  );
  const settlerConfigured = settlerAddress !== undefined && !/^0x0+$/.test(settlerAddress);

  // Allowance check. Skip entirely for native ETH (sourceToken.isNative).
  const allowanceQuery = useReadContract({
    address: sourceToken && !sourceToken.isNative ? sourceToken.address : undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && settlerAddress ? [address, settlerAddress] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: Boolean(
        address &&
          sourceChainId &&
          settlerAddress &&
          sourceToken &&
          !sourceToken.isNative
      ),
      // Refresh on every block so a freshly-confirmed approve flips the
      // button label in one render rather than two.
      refetchInterval: 4_000,
    },
  });

  // approve() write
  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({
    hash: approve.data,
    chainId: sourceChainId,
  });

  // submitIntent() write
  const submit = useWriteContract();
  const submitReceipt = useWaitForTransactionReceipt({
    hash: submit.data,
    chainId: sourceChainId,
  });

  // After submit confirms, parse the IntentSubmitted log to grab the
  // hash and route to the status page.
  useEffect(() => {
    if (!submitReceipt.data) return;
    const hash = extractIntentHash(submitReceipt.data.logs as readonly Log[]);
    if (!hash) {
      toast.error('Settled but could not read intent hash from logs');
      return;
    }
    router.push(`/intent/${hash}`);
  }, [submitReceipt.data, router]);

  // Surface chain-call errors as toasts so the button label stays the
  // primary signal for "what to do next".
  useEffect(() => {
    if (approve.error) toast.error(approve.error.message);
  }, [approve.error]);
  useEffect(() => {
    if (submit.error) toast.error(submit.error.message);
  }, [submit.error]);

  // ----- derive button state -----

  if (!isConnected) {
    return (
      <>
        <Button className="w-full" size="lg" onClick={() => setPickerOpen(true)}>
          Connect wallet
        </Button>
        <WalletPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </>
    );
  }

  if (!isSupportedChain(connectedChainId)) {
    return (
      <Button
        className="w-full"
        size="lg"
        disabled={switchPending}
        onClick={() => switchChain({chainId: 1})}
      >
        {switchPending ? 'Switching…' : 'Switch to Ethereum'}
      </Button>
    );
  }

  if (!settlerConfigured) {
    return (
      <Button className="w-full" size="lg" disabled>
        Settler not deployed on {chainShortName(connectedChainId)}
      </Button>
    );
  }

  if (!sourceToken || !destToken) {
    return (
      <Button className="w-full" size="lg" disabled>
        Pick tokens
      </Button>
    );
  }

  if (sourceToken.symbol === destToken.symbol && sourceChainId === destChainId) {
    return (
      <Button className="w-full" size="lg" disabled>
        Same token, same chain — pick a real swap
      </Button>
    );
  }

  if (!parsed) {
    return (
      <Button className="w-full" size="lg" disabled>
        Enter an amount
      </Button>
    );
  }

  // ERC-20 path: check allowance first.
  if (!sourceToken.isNative) {
    const currentAllowance = allowanceQuery.data;
    const needsApproval =
      currentAllowance === undefined || currentAllowance < parsed.sourceAmountWei;

    if (approveReceipt.isLoading) {
      return (
        <Button className="w-full" size="lg" disabled>
          Approving…
        </Button>
      );
    }
    if (approve.isPending) {
      return (
        <Button className="w-full" size="lg" disabled>
          Confirm approval in wallet
        </Button>
      );
    }
    if (needsApproval && settlerAddress) {
      return (
        <Button
          className="w-full"
          size="lg"
          onClick={() =>
            approve.writeContract({
              address: sourceToken.address,
              abi: erc20Abi,
              functionName: 'approve',
              args: [settlerAddress, parsed.sourceAmountWei],
              chainId: sourceChainId,
            })
          }
        >
          Approve {sourceToken.symbol}
        </Button>
      );
    }
  }

  // Submit path
  if (submitReceipt.isLoading) {
    return (
      <Button className="w-full" size="lg" disabled>
        Submitting…
      </Button>
    );
  }
  if (submit.isPending) {
    return (
      <Button className="w-full" size="lg" disabled>
        Confirm submission in wallet
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      size="lg"
      onClick={() => {
        if (!address || !sourceChainId || !destChainId || !settlerAddress) return;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
        // Date.now() in ms is unique per submission for one user. The
        // contract enforces usedNonces[user][nonce] for replay protection
        // — collisions only happen if a user fires two submits in the
        // same millisecond, which the wallet UX already serialises.
        const nonce = BigInt(Date.now());

        submit.writeContract({
          address: settlerAddress,
          abi: IntentSettlerAbi,
          functionName: 'submitIntent',
          args: [
            {
              sourceChainId: BigInt(sourceChainId),
              sourceToken: sourceToken.address,
              sourceAmount: parsed.sourceAmountWei,
              destChainId: BigInt(destChainId),
              destToken: destToken.address,
              minDestAmount: parsed.minDestAmountWei,
              user: address,
              refundTo: '0x0000000000000000000000000000000000000000',
              deadline,
              nonce,
            },
          ],
          // Native ETH escrow: forward msg.value. ERC-20 path leaves it 0.
          value: sourceToken.isNative ? parsed.sourceAmountWei : 0n,
          chainId: sourceChainId,
        });
      }}
    >
      Submit intent
    </Button>
  );
}

/** Pull the IntentSubmitted hash out of the transaction receipt logs.
 *  The contract emits `IntentSubmitted(bytes32 indexed intentHash,
 *  address indexed user, Intent intent)` as the first state-changing
 *  event from submitIntent — viem's decodeEventLog gives us the args
 *  if we point it at the right ABI fragment. */
function extractIntentHash(logs: readonly Log[]): Hash | undefined {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: IntentSettlerAbi,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (decoded.eventName === 'IntentSubmitted') {
        // intentHash is the first indexed arg
        const args = decoded.args as unknown as {intentHash?: Hash};
        if (args.intentHash) return args.intentHash;
      }
    } catch {
      // Not all logs match — skip and keep scanning.
    }
  }
  return undefined;
}
