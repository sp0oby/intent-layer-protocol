/**
 * Full backend ↔ contracts integration test.
 *
 * Two Anvil instances simulate the Eth ↔ Base corridor. Each runs the
 * full deployed stack (MockLzEndpoint + ChainPeerRegistry + IntentSettler
 * + SolverAuction + a USDC ERC-20 mock). A TS-side LZ relayer ferries
 * messages between the two MockLzEndpoint instances.
 *
 * The test boots the production backend modules unchanged:
 *   - IntentIndexer × 4 (each chain × {settler, auction})
 *   - MatchingLoop (sweeps both chains)
 *   - chain-submitters (real ethers calls into the deployed contracts)
 *
 * Flow:
 *   1. Alice submits 1 ETH → 2400 USDC intent on chain A
 *   2. Bob submits 2400 USDC → 1 ETH intent on chain B
 *   3. Indexers populate the in-memory order book
 *   4. Matcher picks up the pair, calls executeMatching on chain A
 *   5. EXECUTE_MATCH delivered via relayer to chain B
 *   6. Chain B releases USDC to Alice, queues CONFIRM
 *   7. CONFIRM delivered to chain A
 *   8. Chain A releases ETH to Bob, intent → SETTLED
 *   9. Indexer picks up IntentSettled on both chains
 *  10. Final assertions: balances + state
 */

import {describe, expect, it, afterAll} from 'vitest';
import {Contract, parseEther, type Signer} from 'ethers';
import {spawnAnvil, type AnvilHandle} from './helpers/anvil';
import {deployStack, type DeployedStack} from './helpers/deploy-stack';
import {startLzRelayer} from './helpers/lz-relayer';
import {createInMemoryRepository} from './helpers/in-memory-repo';
import {publishingRepository} from '../../src/db/publishing-repository';
import {createEventBus} from '../../src/services/event-bus';
import {IntentIndexer} from '../../src/services/indexer';
import {intentSettlerHandlers, solverAuctionHandlers} from '../../src/services/indexer-handlers';
import {MatchingLoop} from '../../src/services/matching-loop';
import {buildChainSubmitters} from '../../src/services/chain-submitters';
import IntentSettlerAbi from '../../src/abis/IntentSettler.json';
import SolverAuctionAbi from '../../src/abis/SolverAuction.json';

const ETH_CHAIN_ID = 31337;
const ETH_PORT = 38545;
const ETH_EID = 1;
const BASE_CHAIN_ID = 31338;
const BASE_PORT = 38546;
const BASE_EID = 2;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const addrToBytes32 = (address: string): string => '0x' + '0'.repeat(24) + address.slice(2).toLowerCase();

interface Harness {
  ethAnvil: AnvilHandle;
  baseAnvil: AnvilHandle;
  ethStack: DeployedStack;
  baseStack: DeployedStack;
  alice: Signer;
  bob: Signer;
  relayer: Signer;
}

async function buildHarness(): Promise<Harness> {
  const ethAnvil = await spawnAnvil({chainId: ETH_CHAIN_ID, port: ETH_PORT});
  const baseAnvil = await spawnAnvil({chainId: BASE_CHAIN_ID, port: BASE_PORT});

  // Account 0 is the deployer + relayer on both chains. Anvil seeds the
  // same key with 10000 ETH on each instance.
  const ethDeployer = ethAnvil.accounts[0];
  const baseDeployer = baseAnvil.accounts[0];

  // Alice and Bob use accounts[1] and [2]. They have one wallet per chain
  // because each anvil's provider is a different network.
  const alice = ethAnvil.accounts[1];
  const bob = baseAnvil.accounts[2];
  const relayer = ethDeployer;

  const ethStack = await deployStack({
    deployer: ethDeployer,
    ownChainId: ETH_CHAIN_ID,
    ownEid: ETH_EID,
    remoteChainId: BASE_CHAIN_ID,
    remoteEid: BASE_EID,
  });
  const baseStack = await deployStack({
    deployer: baseDeployer,
    ownChainId: BASE_CHAIN_ID,
    ownEid: BASE_EID,
    remoteChainId: ETH_CHAIN_ID,
    remoteEid: ETH_EID,
  });

  // Wire LayerZero peers bilaterally — each settler trusts the other's
  // settler address at the corresponding EID.
  await (
    await ethStack.settler.setPeer!(BASE_EID, addrToBytes32(baseStack.settlerAddress))
  ).wait();
  await (
    await baseStack.settler.setPeer!(ETH_EID, addrToBytes32(ethStack.settlerAddress))
  ).wait();

  // Mint USDC to Bob on the Base side so he can escrow when submitting.
  const baseUsdcAsBob = baseStack.usdc.connect(baseDeployer) as Contract;
  await (await baseUsdcAsBob.mint!(await bob.getAddress(), 2400_000_000n)).wait();

  return {ethAnvil, baseAnvil, ethStack, baseStack, alice, bob, relayer};
}

describe('full backend ↔ contracts round-trip', () => {
  let harness: Harness | undefined;

  afterAll(async () => {
    if (harness) {
      await harness.ethAnvil.stop();
      await harness.baseAnvil.stop();
    }
  });

  it(
    'P2P match settles via real LayerZero round-trip across two Anvils',
    async () => {
      harness = await buildHarness();
      const {ethAnvil, baseAnvil, ethStack, baseStack, alice, bob, relayer} = harness;

      // 0. Snapshot starting balances so we can assert the swap moved tokens.
      const aliceEthStart = await ethAnvil.provider.getBalance(await alice.getAddress());
      const bobBaseUsdcStart = (await baseStack.usdc.balanceOf!(await bob.getAddress())) as bigint;

      // 1. Backend wiring — same modules production uses, just with an
      //    in-memory repository and no API/WS layer.
      const bus = createEventBus();
      const repo = publishingRepository(createInMemoryRepository(), bus);

      const indexers = [
        new IntentIndexer(
          {
            chainId: ETH_CHAIN_ID,
            contractAddress: ethStack.settlerAddress,
            abi: IntentSettlerAbi,
            handlers: intentSettlerHandlers(ETH_CHAIN_ID, BASE_CHAIN_ID),
            startBlock: 0,
            confirmations: 0,
            batchSize: 5000,
            pollIntervalMs: 200,
            backoffBaseMs: 100,
            maxBackoffMs: 1000,
          },
          {provider: ethAnvil.provider, repo}
        ),
        new IntentIndexer(
          {
            chainId: BASE_CHAIN_ID,
            contractAddress: baseStack.settlerAddress,
            abi: IntentSettlerAbi,
            handlers: intentSettlerHandlers(BASE_CHAIN_ID, ETH_CHAIN_ID),
            startBlock: 0,
            confirmations: 0,
            batchSize: 5000,
            pollIntervalMs: 200,
            backoffBaseMs: 100,
            maxBackoffMs: 1000,
          },
          {provider: baseAnvil.provider, repo}
        ),
        new IntentIndexer(
          {
            chainId: ETH_CHAIN_ID,
            contractAddress: ethStack.auctionAddress,
            abi: SolverAuctionAbi,
            handlers: solverAuctionHandlers(),
            startBlock: 0,
            confirmations: 0,
            batchSize: 5000,
            pollIntervalMs: 200,
            backoffBaseMs: 100,
            maxBackoffMs: 1000,
          },
          {provider: ethAnvil.provider, repo}
        ),
        new IntentIndexer(
          {
            chainId: BASE_CHAIN_ID,
            contractAddress: baseStack.auctionAddress,
            abi: SolverAuctionAbi,
            handlers: solverAuctionHandlers(),
            startBlock: 0,
            confirmations: 0,
            batchSize: 5000,
            pollIntervalMs: 200,
            backoffBaseMs: 100,
            maxBackoffMs: 1000,
          },
          {provider: baseAnvil.provider, repo}
        ),
      ];
      for (const idx of indexers) {
        // Catch lifecycle errors so a poll failure during teardown
        // doesn't surface as an unhandled rejection.
        idx.start().catch(() => {});
      }

      const ethSubmitters = buildChainSubmitters({
        chainId: ETH_CHAIN_ID,
        signer: relayer,
        intentSettler: ethStack.settlerAddress,
        solverAuction: ethStack.auctionAddress,
      });
      const baseSubmitters = buildChainSubmitters({
        chainId: BASE_CHAIN_ID,
        signer: baseAnvil.accounts[0],
        intentSettler: baseStack.settlerAddress,
        solverAuction: baseStack.auctionAddress,
      });
      const matcher = new MatchingLoop(
        {sourceChainIds: [ETH_CHAIN_ID, BASE_CHAIN_ID], pollIntervalMs: 500},
        {
          repo,
          submitter: async (input) => {
            if (input.sourceChainId === ETH_CHAIN_ID) return ethSubmitters.matchSubmitter(input);
            if (input.sourceChainId === BASE_CHAIN_ID) return baseSubmitters.matchSubmitter(input);
            return {error: `no submitter for ${input.sourceChainId}`};
          },
        }
      );
      matcher.start().catch(() => {});

      const lzRelayer = startLzRelayer(
        {chainId: ETH_CHAIN_ID, eid: ETH_EID, endpoint: ethStack.endpoint},
        {chainId: BASE_CHAIN_ID, eid: BASE_EID, endpoint: baseStack.endpoint}
      );

      try {
        // 2. Alice submits 1 ETH → 2400 USDC on Eth.
        const aliceIntent = {
          sourceChainId: BigInt(ETH_CHAIN_ID),
          sourceToken: '0x0000000000000000000000000000000000000000',
          sourceAmount: parseEther('1'),
          destChainId: BigInt(BASE_CHAIN_ID),
          destToken: baseStack.usdcAddress,
          minDestAmount: 2400_000_000n,
          user: await alice.getAddress(),
          refundTo: '0x0000000000000000000000000000000000000000',
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
          nonce: 1n,
        };
        const ethSettlerAsAlice = ethStack.settler.connect(alice) as Contract;
        await (
          await ethSettlerAsAlice.submitIntent!(aliceIntent, {value: aliceIntent.sourceAmount})
        ).wait();

        // 3. Bob approves and submits 2400 USDC → 1 ETH on Base.
        const baseUsdcAsBob = baseStack.usdc.connect(bob) as Contract;
        await (
          await baseUsdcAsBob.approve!(baseStack.settlerAddress, 2400_000_000n)
        ).wait();
        const bobIntent = {
          sourceChainId: BigInt(BASE_CHAIN_ID),
          sourceToken: baseStack.usdcAddress,
          sourceAmount: 2400_000_000n,
          destChainId: BigInt(ETH_CHAIN_ID),
          destToken: '0x0000000000000000000000000000000000000000',
          minDestAmount: parseEther('1'),
          user: await bob.getAddress(),
          refundTo: '0x0000000000000000000000000000000000000000',
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
          nonce: 1n,
        };
        const baseSettlerAsBob = baseStack.settler.connect(bob) as Contract;
        await (await baseSettlerAsBob.submitIntent!(bobIntent)).wait();

        // 4. Wait for the matcher to settle the pair. The cap is generous —
        //    indexer poll 200ms + matcher tick 500ms + 2 LZ deliveries.
        const deadline = Date.now() + 30_000;
        let aliceUsdcEnd = 0n;
        let bobEthEnd = 0n;
        while (Date.now() < deadline) {
          aliceUsdcEnd = (await baseStack.usdc.balanceOf!(await alice.getAddress())) as bigint;
          bobEthEnd = await ethAnvil.provider.getBalance(await bob.getAddress());
          if (aliceUsdcEnd === 2400_000_000n && bobEthEnd > parseEther('10000')) break;
          await wait(250);
        }

        // 5. Alice received USDC on Base.
        expect(aliceUsdcEnd).toBe(2400_000_000n);

        // 6. Bob received ETH on Eth (his starting balance was already
        //    10000 ETH; we just check it grew by ~1 ETH minus negligible gas).
        const bobEthGain = bobEthEnd - parseEther('10000');
        expect(bobEthGain).toBeGreaterThan(parseEther('0.99'));

        // 7. Bob's USDC is gone (escrowed then released to Alice).
        const bobUsdcEnd = (await baseStack.usdc.balanceOf!(await bob.getAddress())) as bigint;
        expect(bobUsdcEnd).toBe(0n);
        expect(bobBaseUsdcStart).toBe(2400_000_000n);

        // 8. Alice's ETH dropped by 1 + gas.
        const aliceEthEnd = await ethAnvil.provider.getBalance(await alice.getAddress());
        expect(aliceEthStart - aliceEthEnd).toBeGreaterThan(parseEther('0.99'));

        // 9. The LZ relayer ferried both legs (EXECUTE_MATCH + CONFIRM).
        expect(lzRelayer.count()).toBe(2);
      } finally {
        for (const idx of indexers) idx.stop();
        matcher.stop();
        await lzRelayer.stop();
        // Give the indexers' in-flight provider.getLogs calls time to
        // settle before the Anvils get shut down (afterAll). Otherwise
        // the polls fail mid-flight with ECONNREFUSED and surface as
        // vitest "unhandled rejection" warnings.
        await wait(500);
      }
    },
    {timeout: 90_000}
  );
});
