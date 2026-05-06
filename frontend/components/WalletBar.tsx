'use client';

import {useAccount, useConnect, useDisconnect} from 'wagmi';
import {Button} from '@/components/ui/button';

export function WalletBar() {
  const {address, isConnected} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <Button
      type="button"
      size="sm"
      disabled={!connector || isPending}
      onClick={() => connector && connect({connector})}
    >
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </Button>
  );
}
