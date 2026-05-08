/**
 * Long-running local stack — for hand-on-keyboard frontend testing.
 *
 * Spawns two Anvils, deploys the contract stack on each, then boots
 * the entire backend (indexer × 4 + matching loop + auction
 * orchestrator + REST API + WebSocket) in the SAME process using the
 * in-memory repo from the E2E harness — so no Postgres, no .env
 * config, no extra terminals. One command brings everything up that
 * the frontend needs.
 *
 * Default ports / chain ids match the frontend's local-Anvil entries
 * in `frontend/lib/{chains,tokens,contracts}.ts`, so a fresh
 * `cd frontend && npm run dev` lands on this stack with no env tweaks.
 *
 * Usage:
 *   cd backend && npm run local-stack
 *   # in another terminal: cd frontend && npm run dev
 *   # MetaMask: add Anvil Eth (38545/31337) + Anvil Base (38546/31338)
 */

import http from 'node:http';
import {writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEther} from 'ethers';
import {spawnAnvil, type AnvilHandle} from '../tests/e2e/helpers/anvil.js';
import {deployStack, type DeployedStack} from '../tests/e2e/helpers/deploy-stack.js';
import {createInMemoryRepository} from '../tests/e2e/helpers/in-memory-repo.js';
import {startLzRelayer} from '../tests/e2e/helpers/lz-relayer.js';
import {publishingRepository} from '../src/db/publishing-repository.js';
import {createEventBus} from '../src/services/event-bus.js';
import {IntentIndexer} from '../src/services/indexer.js';
import {intentSettlerHandlers, solverAuctionHandlers} from '../src/services/indexer-handlers.js';
import {MatchingLoop, type MatchSubmitter} from '../src/services/matching-loop.js';
import {AuctionOrchestrator, type AuctionSubmitter} from '../src/services/auction-orchestrator.js';
import {buildChainSubmitters} from '../src/services/chain-submitters.js';
import {createApp} from '../src/server.js';
import {attachWsServer} from '../src/services/ws-server.js';
import IntentSettlerAbi from '../src/abis/IntentSettler.json' with {type: 'json'};
import SolverAuctionAbi from '../src/abis/SolverAuction.json' with {type: 'json'};

const ETH_CHAIN_ID = 31337;
const ETH_PORT = 38545;
const ETH_EID = 1;
const BASE_CHAIN_ID = 31338;
const BASE_PORT = 38546;
const BASE_EID = 2;
const API_PORT = 4000;

const addrToBytes32 = (address: string): string =>
  '0x' + '0'.repeat(24) + address.slice(2).toLowerCase();

const log = (msg: string): void => console.log(`[local-stack] ${msg}`);

async function fundUsdc(
  stack: DeployedStack,
  recipients: ReadonlyArray<string>,
  amountMinor: bigint,
  label: string
): Promise<void> {
  for (const recipient of recipients) {
    await (await stack.usdc.mint!(recipient, amountMinor)).wait();
  }
  log(`minted ${recipients.length} × ${amountMinor.toString()} ${label} to test accounts`);
}

async function topUpEth(
  anvil: AnvilHandle,
  recipients: ReadonlyArray<string>,
  amount: bigint
): Promise<void> {
  const sender = anvil.accounts[0];
  for (const to of recipients) {
    await (await sender.sendTransaction({to, value: amount})).wait();
  }
}

async function main(): Promise<void> {
  log('spawning Anvils…');
  const ethAnvil = await spawnAnvil({chainId: ETH_CHAIN_ID, port: ETH_PORT});
  const baseAnvil = await spawnAnvil({chainId: BASE_CHAIN_ID, port: BASE_PORT});
  log(`Eth  Anvil ready at ${ethAnvil.rpcUrl}  (chain id ${ETH_CHAIN_ID})`);
  log(`Base Anvil ready at ${baseAnvil.rpcUrl}  (chain id ${BASE_CHAIN_ID})`);

  log('deploying stack on Eth…');
  const ethStack = await deployStack({
    deployer: ethAnvil.accounts[0],
    ownChainId: ETH_CHAIN_ID,
    ownEid: ETH_EID,
    remoteChainId: BASE_CHAIN_ID,
    remoteEid: BASE_EID,
  });
  log('deploying stack on Base…');
  const baseStack = await deployStack({
    deployer: baseAnvil.accounts[0],
    ownChainId: BASE_CHAIN_ID,
    ownEid: BASE_EID,
    remoteChainId: ETH_CHAIN_ID,
    remoteEid: ETH_EID,
  });

  log('wiring peers…');
  await (await ethStack.settler.setPeer!(BASE_EID, addrToBytes32(baseStack.settlerAddress))).wait();
  await (await baseStack.settler.setPeer!(ETH_EID, addrToBytes32(ethStack.settlerAddress))).wait();

  const recipients = ethAnvil.accounts
    .slice(0, 5)
    .map((acc) => acc.getAddress() as Promise<string>);
  const recipientAddrs = await Promise.all(recipients);
  await fundUsdc(ethStack, recipientAddrs, 10_000_000_000n, 'Eth USDC');
  await fundUsdc(baseStack, recipientAddrs, 10_000_000_000n, 'Base USDC');
  await topUpEth(baseAnvil, recipientAddrs.slice(5), parseEther('1'));

  // ============== backend services in the same process ==============
  log('booting backend services…');

  const bus = createEventBus();
  const repo = publishingRepository(createInMemoryRepository(), bus);

  const indexerCommon = {
    startBlock: 0,
    confirmations: 0,
    batchSize: 5_000,
    pollIntervalMs: 500,
    backoffBaseMs: 250,
    maxBackoffMs: 5_000,
  };
  const indexers = [
    new IntentIndexer(
      {
        ...indexerCommon,
        chainId: ETH_CHAIN_ID,
        contractAddress: ethStack.settlerAddress,
        abi: IntentSettlerAbi,
        handlers: intentSettlerHandlers(ETH_CHAIN_ID, BASE_CHAIN_ID),
      },
      {provider: ethAnvil.provider, repo}
    ),
    new IntentIndexer(
      {
        ...indexerCommon,
        chainId: BASE_CHAIN_ID,
        contractAddress: baseStack.settlerAddress,
        abi: IntentSettlerAbi,
        handlers: intentSettlerHandlers(BASE_CHAIN_ID, ETH_CHAIN_ID),
      },
      {provider: baseAnvil.provider, repo}
    ),
    new IntentIndexer(
      {
        ...indexerCommon,
        chainId: ETH_CHAIN_ID,
        contractAddress: ethStack.auctionAddress,
        abi: SolverAuctionAbi,
        handlers: solverAuctionHandlers(),
      },
      {provider: ethAnvil.provider, repo}
    ),
    new IntentIndexer(
      {
        ...indexerCommon,
        chainId: BASE_CHAIN_ID,
        contractAddress: baseStack.auctionAddress,
        abi: SolverAuctionAbi,
        handlers: solverAuctionHandlers(),
      },
      {provider: baseAnvil.provider, repo}
    ),
  ];

  // Account 0 on each chain doubles as the deployer (already has every
  // role: registry owner, OApp delegate) and the relayer that submits
  // executeMatching / openAuction / executeWinningProposal.
  const ethSubmitters = buildChainSubmitters({
    chainId: ETH_CHAIN_ID,
    signer: ethAnvil.accounts[0],
    intentSettler: ethStack.settlerAddress,
    solverAuction: ethStack.auctionAddress,
  });
  const baseSubmitters = buildChainSubmitters({
    chainId: BASE_CHAIN_ID,
    signer: baseAnvil.accounts[0],
    intentSettler: baseStack.settlerAddress,
    solverAuction: baseStack.auctionAddress,
  });

  const matchSubmitter: MatchSubmitter = (input) =>
    input.sourceChainId === ETH_CHAIN_ID
      ? ethSubmitters.matchSubmitter(input)
      : input.sourceChainId === BASE_CHAIN_ID
        ? baseSubmitters.matchSubmitter(input)
        : Promise.resolve({error: `no submitter for ${input.sourceChainId}`});

  const openSubmitter: AuctionSubmitter = (input) =>
    input.sourceChainId === ETH_CHAIN_ID
      ? ethSubmitters.openAuctionSubmitter(input)
      : input.sourceChainId === BASE_CHAIN_ID
        ? baseSubmitters.openAuctionSubmitter(input)
        : Promise.resolve({error: `no submitter for ${input.sourceChainId}`});

  const finalizeSubmitter: AuctionSubmitter = (input) =>
    input.sourceChainId === ETH_CHAIN_ID
      ? ethSubmitters.finalizeAuctionSubmitter(input)
      : input.sourceChainId === BASE_CHAIN_ID
        ? baseSubmitters.finalizeAuctionSubmitter(input)
        : Promise.resolve({error: `no submitter for ${input.sourceChainId}`});

  const matcher = new MatchingLoop(
    {sourceChainIds: [ETH_CHAIN_ID, BASE_CHAIN_ID], pollIntervalMs: 1_500},
    {repo, submitter: matchSubmitter}
  );
  const orchestrator = new AuctionOrchestrator(
    {sourceChainIds: [ETH_CHAIN_ID, BASE_CHAIN_ID], pollIntervalMs: 5_000},
    {repo, openSubmitter, finalizeSubmitter}
  );

  // Cross-Anvil LayerZero relayer — pumps queued messages between the
  // two MockLzEndpoint instances. Without it CONFIRM / EXECUTE_MATCH
  // never reach the destination chain and intents stick on Matched
  // until LZ_TIMEOUT (6h). Same helper the E2E test uses.
  const lzRelayer = startLzRelayer(
    {chainId: ETH_CHAIN_ID, eid: ETH_EID, endpoint: ethStack.endpoint},
    {chainId: BASE_CHAIN_ID, eid: BASE_EID, endpoint: baseStack.endpoint}
  );

  // Write the actually-deployed addresses to frontend/.env.local so the
  // frontend's NEXT_PUBLIC_LOCAL_*_ADDRESS overrides pick them up. The
  // CREATE addresses can drift across process restarts (ethers v6 +
  // NonceManager + Windows have shown this in practice), so we don't
  // rely on the hardcoded defaults in `frontend/lib/contracts.ts` for
  // local-stack runs. Restart `cd frontend && npm run dev` after
  // local-stack changes for Next.js to re-read the env file.
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '..', 'frontend', '.env.local');
  const envBody = [
    '# Generated by backend/scripts/local-stack.ts on every run.',
    '# Restart `cd frontend && npm run dev` to pick up changes.',
    `NEXT_PUBLIC_API_BASE_URL=http://localhost:${API_PORT}`,
    `NEXT_PUBLIC_LOCAL_ETH_SETTLER_ADDRESS=${ethStack.settlerAddress}`,
    `NEXT_PUBLIC_LOCAL_BASE_SETTLER_ADDRESS=${baseStack.settlerAddress}`,
    `NEXT_PUBLIC_LOCAL_ETH_SOLVER_AUCTION_ADDRESS=${ethStack.auctionAddress}`,
    `NEXT_PUBLIC_LOCAL_BASE_SOLVER_AUCTION_ADDRESS=${baseStack.auctionAddress}`,
    `NEXT_PUBLIC_LOCAL_ETH_CHAIN_PEER_REGISTRY_ADDRESS=${ethStack.registryAddress}`,
    `NEXT_PUBLIC_LOCAL_BASE_CHAIN_PEER_REGISTRY_ADDRESS=${baseStack.registryAddress}`,
    `NEXT_PUBLIC_LOCAL_USDC_ADDRESS=${ethStack.usdcAddress}`,
    '',
  ].join('\n');
  await writeFile(envPath, envBody, 'utf8');
  log(`wrote ${join('frontend', '.env.local')} with the deployed addresses`);

  // REST + WebSocket
  const app = createApp({
    repo,
    config: {
      solverAuctionByChain: {
        [ETH_CHAIN_ID]: ethStack.auctionAddress,
        [BASE_CHAIN_ID]: baseStack.auctionAddress,
      },
    },
  });
  const httpServer = http.createServer(app);
  attachWsServer(httpServer, bus);
  await new Promise<void>((resolve) => httpServer.listen(API_PORT, '127.0.0.1', () => resolve()));

  // Start the loops. Catch any errors so a single subsystem failure
  // doesn't crash the whole harness — the user will see logs but
  // can keep working in other parts of the UI.
  for (const idx of indexers) idx.start().catch((err) => log(`indexer error: ${String(err)}`));
  matcher.start().catch((err) => log(`matcher error: ${String(err)}`));
  orchestrator.start().catch((err) => log(`orchestrator error: ${String(err)}`));

  log('---');
  log('Local stack ready.');
  log('');
  log('Chains:');
  log(`  Eth  →  RPC: ${ethAnvil.rpcUrl}   chain id: ${ETH_CHAIN_ID}`);
  log(`  Base →  RPC: ${baseAnvil.rpcUrl}   chain id: ${BASE_CHAIN_ID}`);
  log('');
  log('Backend (in-process, no Postgres):');
  log(`  REST + WebSocket on http://localhost:${API_PORT}`);
  log(`  4 indexers running, matching loop + auction orchestrator + LZ relayer wired`);
  log('');
  log('Deployed addresses (identical on both chains — deterministic deploy):');
  log(`  IntentSettler:     ${ethStack.settlerAddress}`);
  log(`  SolverAuction:     ${ethStack.auctionAddress}`);
  log(`  ChainPeerRegistry: ${ethStack.registryAddress}`);
  log(`  USDC (mock):       ${ethStack.usdcAddress}`);
  log('');
  log('Test accounts pre-funded with 10k USDC each:');
  for (const addr of recipientAddrs) log(`  ${addr}`);
  log('');
  log('Frontend addresses written to frontend/.env.local — restart');
  log('`cd frontend && npm run dev` once for Next to re-read the env, then');
  log('open http://localhost:3000/swap, connect MetaMask, and try a swap.');
  log('---');
  log('Ctrl+C to tear down.');

  await new Promise<void>((resolve) => {
    const stop = async (signal: NodeJS.Signals): Promise<void> => {
      log(`received ${signal} — stopping…`);
      for (const idx of indexers) idx.stop();
      matcher.stop();
      orchestrator.stop();
      await lzRelayer.stop();
      await new Promise<void>((done) => httpServer.close(() => done()));
      await ethAnvil.stop();
      await baseAnvil.stop();
      resolve();
    };
    process.once('SIGINT', () => void stop('SIGINT'));
    process.once('SIGTERM', () => void stop('SIGTERM'));
  });
}

main().catch((err) => {
  console.error('[local-stack] fatal:', err);
  process.exit(1);
});
