/**
 * Anvil child-process management for E2E tests.
 *
 * Spawns an Anvil instance with a configurable chainId and port, polls
 * eth_blockNumber until ready, and exposes a stop() to clean up.
 *
 * We bind two Anvils per test to simulate the Eth↔Base corridor.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {JsonRpcProvider, NonceManager, Wallet, type Signer} from 'ethers';

export interface AnvilHandle {
  rpcUrl: string;
  chainId: number;
  provider: JsonRpcProvider;
  /** Pre-funded test accounts wrapped in NonceManager. ethers v6's
   *  default Wallet trusts the provider's cached nonce, which on Windows +
   *  Anvil 1.5.1 returns stale values that lead to NONCE_EXPIRED on
   *  rapid sequential transactions. NonceManager tracks the next nonce
   *  locally, incrementing per submitted tx. */
  accounts: Signer[];
  /** Underlying wallet keys — useful when a test needs to pass the raw
   *  Wallet rather than the NonceManager wrapper (e.g. for signMessage). */
  wallets: Wallet[];
  stop: () => Promise<void>;
}

/** Anvil's deterministic seed phrase produces these private keys. We
 *  precompute the first 10 so tests don't need to derive them. */
const ANVIL_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
];

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    // SIGTERM first; on Windows this is translated to TerminateProcess.
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      resolve();
    }, 2000);
  });
}

export async function spawnAnvil(opts: {chainId: number; port: number}): Promise<AnvilHandle> {
  const child: ChildProcess = spawn(
    'anvil',
    [
      '--chain-id',
      String(opts.chainId),
      '--port',
      String(opts.port),
      '--host',
      '127.0.0.1',
    ],
    {stdio: 'pipe'}
  );

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  // Track whether Anvil exited before we finished polling.
  let childExitError: Error | null = null;
  child.on('error', (err) => {
    childExitError = new Error(`anvil spawn failed: ${err.message}\n${stderr}`);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      childExitError = new Error(`anvil exited early (code ${code}) — port ${opts.port} may be in use.\nstderr: ${stderr}`);
    }
  });

  const rpcUrl = `http://127.0.0.1:${opts.port}`;
  // No network arg — let ethers detect via eth_chainId on first call.
  // Passing a bare number was confusing ethers v6's network-detection
  // path on Windows + Anvil 1.5.1, leading to cached stale state.
  const provider = new JsonRpcProvider(rpcUrl);

  // Wait for Anvil to accept JSON-RPC. Up to 20s — Windows startup is slower.
  const deadline = Date.now() + 20_000;
  let connected = false;
  while (Date.now() < deadline) {
    if (childExitError) {
      // Anvil process died — kill provider polling and surface the error.
      provider.destroy();
      throw childExitError;
    }
    try {
      await provider.getBlockNumber();
      connected = true;
      break;
    } catch {
      await wait(100);
    }
  }

  if (!connected) {
    // Timed out — kill the child so it doesn't leak into the next test run.
    provider.destroy();
    await killChild(child);
    throw new Error(
      `anvil on port ${opts.port} did not respond within 20s.\nstderr: ${stderr}`
    );
  }

  const stop = async (): Promise<void> => {
    provider.destroy();
    await killChild(child);
  };

  const wallets = ANVIL_KEYS.map((key) => new Wallet(key, provider));
  const accounts = wallets.map((w) => new NonceManager(w));

  return {rpcUrl, chainId: opts.chainId, provider, accounts, wallets, stop};
}
