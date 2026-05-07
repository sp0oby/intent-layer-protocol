'use client';

import {Check, Copy, LogOut} from 'lucide-react';
import {useState} from 'react';
import {useChainId, useConnection, useDisconnect} from 'wagmi';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {WalletPickerDialog} from '@/components/WalletPickerDialog';
import {chainShortName, isSupportedChain} from '@/lib/chains';

/**
 * Single-button wallet control. Two states:
 *   disconnected → "Connect wallet" — opens the multi-wallet picker
 *   connected    → "[chain] · 0x1234…cdef" with a popover for copy + disconnect
 *
 * useConnection replaces wagmi v3's deprecated useAccount alias.
 */
export function WalletButton() {
  const {address, isConnected} = useConnection();
  const {disconnect} = useDisconnect();
  const chainId = useChainId();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!isConnected || !address) {
    return (
      <>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          Connect wallet
        </Button>
        <WalletPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </>
    );
  }

  return <ConnectedButton address={address} chainId={chainId} disconnect={disconnect} />;
}

function ConnectedButton({
  address,
  chainId,
  disconnect,
}: {
  address: `0x${string}`;
  chainId: number;
  disconnect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const supported = isSupportedChain(chainId);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success('Address copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy address');
    }
  };

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-muted-foreground">
          {supported ? chainShortName(chainId) : `Chain ${chainId}`}
        </span>
        <span className="mx-1.5 text-muted-foreground/40">·</span>
        <span className="font-mono text-xs">{truncated}</span>
      </Button>

      {open ? (
        <>
          {/* Click-away catcher. */}
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void copy();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              Copy address
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
