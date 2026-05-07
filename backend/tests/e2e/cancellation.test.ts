/**
 * Single-chain cancellation E2E.
 *
 * Verifies that the indexer correctly observes the IntentCancelled event
 * emitted when the user calls cancelIntent on the deployed contract,
 * and that the in-memory repository transitions to CANCELLED. The token
 * refund is checked via the on-chain ETH balance.
 */

import {describe, expect, it, afterAll} from 'vitest';
import {Contract, parseEther, type Signer} from 'ethers';
import {spawnAnvil, type AnvilHandle} from './helpers/anvil';
import {deployStack, type DeployedStack} from './helpers/deploy-stack';
import {createInMemoryRepository} from './helpers/in-memory-repo';
import {publishingRepository} from '../../src/db/publishing-repository';
import {createEventBus} from '../../src/services/event-bus';
import {IntentIndexer} from '../../src/services/indexer';
import {intentSettlerHandlers} from '../../src/services/indexer-handlers';
import IntentSettlerAbi from '../../src/abis/IntentSettler.json';

const CHAIN_ID = 31337;
const PORT = 38555;
const EID = 1;
const REMOTE_CHAIN_ID = 31338;
const REMOTE_EID = 2;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Harness {
  anvil: AnvilHandle;
  stack: DeployedStack;
  alice: Signer;
}

async function buildHarness(): Promise<Harness> {
  const anvil = await spawnAnvil({chainId: CHAIN_ID, port: PORT});
  const stack = await deployStack({
    deployer: anvil.accounts[0],
    ownChainId: CHAIN_ID,
    ownEid: EID,
    remoteChainId: REMOTE_CHAIN_ID,
    remoteEid: REMOTE_EID,
  });
  return {anvil, stack, alice: anvil.accounts[1]};
}

describe('cancellation round-trip', () => {
  let harness: Harness | undefined;
  afterAll(async () => {
    if (harness) await harness.anvil.stop();
  });

  it(
    'submit -> cancel -> indexer observes both -> ETH refunded',
    async () => {
      harness = await buildHarness();
      const {anvil, stack, alice} = harness;

      const repo = publishingRepository(createInMemoryRepository(), createEventBus());
      const indexer = new IntentIndexer(
        {
          chainId: CHAIN_ID,
          contractAddress: stack.settlerAddress,
          abi: IntentSettlerAbi,
          handlers: intentSettlerHandlers(CHAIN_ID, REMOTE_CHAIN_ID),
          startBlock: 0,
          confirmations: 0,
          batchSize: 5000,
          pollIntervalMs: 200,
          backoffBaseMs: 100,
          maxBackoffMs: 1000,
        },
        {provider: anvil.provider, repo}
      );
      indexer.start().catch(() => {});

      try {
        const aliceAddress = await alice.getAddress();
        const aliceBalanceStart = await anvil.provider.getBalance(aliceAddress);

        const intent = {
          sourceChainId: BigInt(CHAIN_ID),
          sourceToken: '0x0000000000000000000000000000000000000000',
          sourceAmount: parseEther('1'),
          destChainId: BigInt(REMOTE_CHAIN_ID),
          destToken: '0xdddd000000000000000000000000000000000004',
          minDestAmount: 2400_000_000n,
          user: aliceAddress,
          refundTo: '0x0000000000000000000000000000000000000000',
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
          nonce: 1n,
        };
        const settlerAsAlice = stack.settler.connect(alice) as Contract;

        // Static call to compute the intent hash without spending gas.
        const intentHash = (await stack.settler.hashIntent!(intent)) as string;
        expect(intentHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        await (await settlerAsAlice.submitIntent!(intent, {value: intent.sourceAmount})).wait();

        // Wait for indexer to pick up IntentSubmitted.
        const submitDeadline = Date.now() + 5_000;
        let stored = null;
        while (Date.now() < submitDeadline) {
          stored = await repo.getIntent(intentHash);
          if (stored && stored.state === 'PENDING') break;
          await wait(100);
        }
        expect(stored?.state).toBe('PENDING');

        // Cancel.
        const balanceBeforeCancel = await anvil.provider.getBalance(aliceAddress);
        await (await settlerAsAlice.cancelIntent!(intentHash)).wait();

        // Wait for indexer to pick up IntentCancelled.
        const cancelDeadline = Date.now() + 10_000;
        while (Date.now() < cancelDeadline) {
          stored = await repo.getIntent(intentHash);
          if (stored && stored.state === 'CANCELLED') break;
          await wait(200);
        }
        expect(stored?.state).toBe('CANCELLED');

        // Alice should have received the 1 ETH escrow back (minus gas for
        // the cancel tx, which is small). Net: she's back to ~aliceStart
        // minus only a small gas cost for two txs.
        const balanceAfterCancel = await anvil.provider.getBalance(aliceAddress);
        expect(balanceAfterCancel).toBeGreaterThan(balanceBeforeCancel + parseEther('0.99'));
        const totalGasSpent = aliceBalanceStart - balanceAfterCancel;
        // Two txs (submit + cancel). Gas budget: <0.01 ETH for both.
        expect(totalGasSpent).toBeLessThan(parseEther('0.01'));
      } finally {
        indexer.stop();
        await wait(300);
      }
    },
    {timeout: 60_000}
  );
});
