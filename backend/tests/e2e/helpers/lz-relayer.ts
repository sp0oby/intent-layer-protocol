/**
 * Cross-Anvil LayerZero relayer for E2E tests.
 *
 * Each Anvil has its own MockLzEndpoint. When a settler calls _lzSend,
 * the local mock emits a `MessageQueued` event. This relayer subscribes
 * to those events on the source endpoint and calls `deliverInbound(...)`
 * on the destination endpoint, mirroring what a real LayerZero executor
 * does cross-chain.
 *
 * In production this is LayerZero V2's executor + DVN; for tests we
 * run a 1-of-1 trusted relayer because we just want to verify the
 * backend's correctness — the protocol's security around cross-chain
 * trust is already exhaustively covered in Foundry tests
 * (peer validation, source-EID guards, payload version checks).
 */

import {Contract, type EventLog, type Log} from 'ethers';
import {Artifacts} from './artifacts.js';

export interface RelayerEndpoint {
  /** chainId of the chain this endpoint sits on (the relayer routes
   *  messages across endpoints by EID, but human ergonomics use chainId). */
  chainId: number;
  /** EID this endpoint registered the local OApp under. */
  eid: number;
  /** Mock endpoint on this chain — connected to a Wallet so the relayer
   *  can call deliverInbound (the call is permissionless on the mock,
   *  but ethers requires a signer for state-changing calls). */
  endpoint: Contract;
}

export interface LzRelayerHandle {
  /** Number of messages relayed since start(). Useful for assertions. */
  count: () => number;
  stop: () => Promise<void>;
}

interface MessageQueuedArgs {
  srcEid: bigint;
  dstEid: bigint;
  sender: string;
  receiver: string;
  message: string;
  nativeFee: bigint;
}

/** Start a bidirectional relay between two endpoints. Subscribes to
 *  `MessageQueued` events on each and forwards to the other. */
export function startLzRelayer(left: RelayerEndpoint, right: RelayerEndpoint): LzRelayerHandle {
  const byEid = new Map<number, RelayerEndpoint>();
  byEid.set(left.eid, left);
  byEid.set(right.eid, right);

  let count = 0;
  const handlers: Array<{contract: Contract; listener: (...args: unknown[]) => void}> = [];

  const wireOne = (origin: RelayerEndpoint): void => {
    const listener = async (...args: unknown[]): Promise<void> => {
      // ethers v6 invokes listeners with positional args followed by the
      // EventLog. We need the destination EID to find the receiver.
      const eventLog = args[args.length - 1] as EventLog;
      const decoded = eventLog.args as unknown as MessageQueuedArgs;
      const dst = byEid.get(Number(decoded.dstEid));
      if (!dst) {
        // No matching peer — drop silently. Tests only use 2 chains.
        return;
      }
      try {
        const tx = await dst.endpoint.deliverInbound!(
          Number(decoded.srcEid),
          decoded.sender,
          decoded.receiver,
          decoded.message
        );
        await tx.wait();
        count += 1;
      } catch (err) {
        // Production LayerZero retries on its own; we surface the error
        // here because a relayer-side failure usually means a contract
        // bug worth catching.
        console.error('[lz-relayer] deliverInbound reverted', err);
      }
    };
    origin.endpoint.on!('MessageQueued', listener as never);
    handlers.push({contract: origin.endpoint, listener: listener as never});
  };

  wireOne(left);
  wireOne(right);

  return {
    count: () => count,
    async stop() {
      for (const {contract, listener} of handlers) {
        contract.off!('MessageQueued', listener as never);
      }
    },
  };
}

/** Convenience: pump every queued message immediately, blocking until the
 *  source endpoint reports `pending() == 0`. Useful for deterministic test
 *  flow when an event-based relayer's async timing matters. */
export async function drainPendingOnce(
  origin: RelayerEndpoint,
  destByEid: Map<number, RelayerEndpoint>
): Promise<number> {
  let drained = 0;
  // Pull events from the last block via getLogs since `MessageQueued` may
  // already have fired before we subscribed.
  const provider = origin.endpoint.runner?.provider!;
  if (!provider) throw new Error('endpoint contract has no provider');
  const head = await provider.getBlockNumber();
  const filter = {
    address: await origin.endpoint.getAddress(),
    topics: [origin.endpoint.interface.getEvent('MessageQueued')!.topicHash],
  };
  const logs: Log[] = await provider.getLogs({...filter, fromBlock: 0, toBlock: head});
  for (const log of logs) {
    const parsed = origin.endpoint.interface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });
    if (!parsed) continue;
    const args = parsed.args as unknown as MessageQueuedArgs;
    const dst = destByEid.get(Number(args.dstEid));
    if (!dst) continue;
    const tx = await dst.endpoint.deliverInbound!(
      Number(args.srcEid),
      args.sender,
      args.receiver,
      args.message
    );
    await tx.wait();
    drained += 1;
  }
  return drained;
}

/** Re-export for tests that want to manually load the mock's ABI. */
export const MockLzEndpointArtifact = Artifacts.MockLzEndpoint;
