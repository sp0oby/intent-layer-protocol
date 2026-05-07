'use client';

import {useChainId, useConnection, useSwitchChain} from 'wagmi';
import {Button} from '@/components/ui/button';
import {SUPPORTED_CHAINS, chainShortName, isSupportedChain} from '@/lib/chains';

/**
 * Renders only when the user is connected to a chain we don't support
 * (anything outside Phase 1's Eth + Base mainnet/Sepolia). Offers
 * one-click switching to each supported chain.
 *
 * The banner is intentionally quiet — a single border line with two
 * inline switch buttons. No icons, no colour. The signal is the words.
 */
export function NetworkBanner() {
  const {isConnected} = useConnection();
  const chainId = useChainId();
  const {switchChain, isPending} = useSwitchChain();

  if (!isConnected) return null;
  if (isSupportedChain(chainId)) return null;

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6 py-3 text-sm">
        <span className="text-muted-foreground">
          Connected to chain {chainId} — not supported in Phase 1.
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Switch to</span>
          {SUPPORTED_CHAINS.map((chain) => (
            <Button
              key={chain.id}
              size="xs"
              variant="outline"
              disabled={isPending}
              onClick={() => switchChain({chainId: chain.id})}
            >
              {chainShortName(chain.id)}
            </Button>
          ))}
        </span>
      </div>
    </div>
  );
}
