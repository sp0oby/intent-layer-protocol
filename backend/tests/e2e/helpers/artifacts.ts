/**
 * Read Foundry artifacts (ABI + bytecode) for ethers ContractFactory.
 *
 * The extract-abis script in scripts/ only ships the ABI to backend/src
 * because the bytecode is huge and prod doesn't deploy. E2E tests do
 * deploy, so we read the full artifact at test time directly from
 * contracts/out/.
 */

import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const outDir = join(repoRoot, 'contracts', 'out');

export interface Artifact {
  abi: unknown[];
  bytecode: string;
}

function loadArtifact(solFile: string, contractName: string): Artifact {
  const path = join(outDir, solFile, `${contractName}.json`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as {abi?: unknown[]; bytecode?: {object?: string} | string};
  if (!Array.isArray(parsed.abi)) throw new Error(`bad ABI in ${path}`);
  // Foundry artifacts wrap bytecode under `.bytecode.object`.
  const bytecode =
    typeof parsed.bytecode === 'string' ? parsed.bytecode : (parsed.bytecode?.object ?? '');
  if (!bytecode || !bytecode.startsWith('0x')) throw new Error(`bad bytecode in ${path}`);
  return {abi: parsed.abi, bytecode};
}

export const Artifacts = {
  IntentSettler: () => loadArtifact('IntentSettler.sol', 'IntentSettler'),
  ChainPeerRegistry: () => loadArtifact('ChainPeerRegistry.sol', 'ChainPeerRegistry'),
  SolverAuction: () => loadArtifact('SolverAuction.sol', 'SolverAuction'),
  MockLzEndpoint: () => loadArtifact('MockLzEndpoint.sol', 'MockLzEndpoint'),
  MockERC20: () => loadArtifact('MockERC20.sol', 'MockERC20'),
};
