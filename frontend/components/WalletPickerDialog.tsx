'use client';

import {useEffect} from 'react';
import {useConnect, type Connector} from 'wagmi';
import {toast} from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';

/**
 * Wallet picker. Controlled — caller owns the trigger and the open state.
 * Lists every configured connector; picking a row calls
 * `connect({connector})` and the dialog auto-closes once the mutation
 * reports isSuccess.
 *
 * Display rules:
 *   - Each row renders the connector's wagmi `name`. Icons come from
 *     `connector.icon` when the SDK exposes one (MetaMask SDK, Coinbase,
 *     WalletConnect — Safe and bare Injected do not).
 *   - Pending row stays interactive (so the user sees "Connecting…");
 *     the others disable to prevent two pending connects.
 *   - On error, surface via sonner so the user knows the dialog isn't
 *     stuck — they can pick a different wallet.
 */
export function WalletPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const {connect, connectors, isPending, isSuccess, variables} = useConnect({
    mutation: {
      onError: (err) => toast.error(err.message),
    },
  });

  // Auto-close on a successful connect. Keeping this in an effect (not
  // the mutation's onSuccess callback) so the picker still closes when
  // wagmi's hook state lags one render behind the mutation.
  useEffect(() => {
    if (isSuccess && open) onOpenChange(false);
  }, [isSuccess, open, onOpenChange]);

  // `variables.connector` is typed as `Connector | CreateConnectorFn`. We only
  // ever pass Connector instances from the picker, so narrow with an `'uid' in`
  // check to satisfy the strict union.
  const pendingConnector = variables?.connector;
  const pendingConnectorUid =
    isPending && pendingConnector && typeof pendingConnector === 'object' && 'uid' in pendingConnector
      ? (pendingConnector as Connector).uid
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription>
            By connecting you agree to the protocol&rsquo;s terms. The site never sees your seed
            phrase.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {connectors.map((connector) => (
            <ConnectorRow
              key={connector.uid}
              connector={connector}
              pending={pendingConnectorUid === connector.uid}
              disabled={isPending && pendingConnectorUid !== connector.uid}
              onSelect={() => connect({connector})}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectorRow({
  connector,
  pending,
  disabled,
  onSelect,
}: {
  connector: Connector;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const icon = (connector as Connector & {icon?: string}).icon;
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={disabled}
      onClick={onSelect}
      className="h-12 justify-start gap-3 text-sm"
    >
      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted">
        {icon ? (
          // Connector icons arrive as data URLs from the wallet SDK — Next/Image
          // can't optimise data URIs anyway, so a plain <img> is the right tool.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" className="size-full object-cover" aria-hidden="true" />
        ) : (
          <span className="text-[10px] uppercase text-muted-foreground">
            {connector.name.slice(0, 2)}
          </span>
        )}
      </span>
      <span className="flex-1 text-left">{connector.name}</span>
      {pending ? <span className="text-xs text-muted-foreground">Connecting…</span> : null}
    </Button>
  );
}
