/**
 * Long-running local stack — for hand-on-keyboard frontend testing.
 *
 * Reuses the Stage 4 E2E helpers (`tests/e2e/helpers/{anvil,deploy-stack}.ts`)
 * but, unlike `tests/e2e/full-roundtrip.test.ts`, this script HOLDS the
 * Anvils open until you SIGINT (Ctrl+C). After deploying it prints every
 * address the frontend needs and a few suggested MetaMask connection
 * steps so you can submit intents through the browser end-to-end.
 *
 * Default ports (38545 / 38546) and chain ids (31337 / 31338) match the
 * frontend's local-Anvil entries in `frontend/lib/{chains,tokens,contracts}.ts`,
 * so a fresh `npm run dev` against this stack works without env tweaks.
 *
 * Usage:
 *   cd backend && npm run local-stack
 *   # in another terminal: cd frontend && npm run dev
 *   # in MetaMask: add the two networks below, switch to one, connect.
 */

import {parseEther} from 'ethers';
import {spawnAnvil, type AnvilHandle} from '../tests/e2e/helpers/anvil.js';
import {deployStack, type DeployedStack} from '../tests/e2e/helpers/deploy-stack.js';

const ETH_CHAIN_ID = 31337;
const ETH_PORT = 38545;
const ETH_EID = 1;
const BASE_CHAIN_ID = 31338;
const BASE_PORT = 38546;
const BASE_EID = 2;

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
  // Anvil seeds account[0] with 10000 ETH. Send a slice to the others
  // so test accounts can pay gas without needing the faucet UI.
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

  // Wire LayerZero peers bilaterally — same step the E2E test does.
  log('wiring peers…');
  await (
    await ethStack.settler.setPeer!(BASE_EID, addrToBytes32(baseStack.settlerAddress))
  ).wait();
  await (
    await baseStack.settler.setPeer!(ETH_EID, addrToBytes32(ethStack.settlerAddress))
  ).wait();

  // Mint test USDC to the first 5 Anvil accounts on each chain so the
  // frontend's ERC-20 path has real balance to spend during manual
  // testing. Native ETH each account already has plenty of from Anvil.
  const recipients = ethAnvil.accounts
    .slice(0, 5)
    .map((acc) => acc.getAddress() as Promise<string>);
  const recipientAddrs = await Promise.all(recipients);
  await fundUsdc(ethStack, recipientAddrs, 10_000_000_000n, 'Eth USDC'); // 10k USDC each
  await fundUsdc(baseStack, recipientAddrs, 10_000_000_000n, 'Base USDC');

  // Top up account[5..9] with a little ETH on Base in case they aren't
  // pre-funded by the Base Anvil's snapshot (Anvil seeds 10000 ETH per
  // account so this is mostly belt-and-braces — skip if not needed).
  await topUpEth(baseAnvil, recipientAddrs.slice(5), parseEther('1'));

  log('---');
  log('Local stack ready. Add these networks in MetaMask and connect:');
  log('');
  log(`  Eth  →  RPC: ${ethAnvil.rpcUrl}   chain id: ${ETH_CHAIN_ID}`);
  log(`  Base →  RPC: ${baseAnvil.rpcUrl}   chain id: ${BASE_CHAIN_ID}`);
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
  log('Frontend defaults already point here. Run `cd frontend && npm run dev`,');
  log('open http://localhost:3000/swap, connect MetaMask, and try a swap.');
  log('---');
  log('Ctrl+C to tear down.');

  // Hold the process open until SIGINT/SIGTERM. Anvil teardown runs in
  // the cleanup handler so ports are freed for the next run.
  await new Promise<void>((resolve) => {
    const stop = async (signal: NodeJS.Signals): Promise<void> => {
      log(`received ${signal} — stopping Anvils`);
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
