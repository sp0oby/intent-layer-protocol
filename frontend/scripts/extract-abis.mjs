#!/usr/bin/env node
// Extract ABI-only JSON from Foundry artifacts into frontend/lib/abis/.
//
// Mirrors backend/scripts/extract-abis.mjs. Each package keeps its own
// vendored ABIs so the frontend builds (Vercel etc.) without needing
// the backend to be present. Run after `forge build` whenever the
// contract surface changes.

import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outDir = join(repoRoot, 'contracts', 'out');
const abiDir = join(repoRoot, 'frontend', 'lib', 'abis');

const targets = [
  {sol: 'IntentSettler.sol', name: 'IntentSettler'},
  {sol: 'SolverAuction.sol', name: 'SolverAuction'},
  {sol: 'ChainPeerRegistry.sol', name: 'ChainPeerRegistry'},
];

if (!existsSync(outDir)) {
  console.error(`contracts/out not found at ${outDir}. Run 'forge build' in contracts/ first.`);
  process.exit(1);
}

mkdirSync(abiDir, {recursive: true});

for (const {sol, name} of targets) {
  const src = join(outDir, sol, `${name}.json`);
  if (!existsSync(src)) {
    console.error(`Artifact missing: ${src}. Did 'forge build' succeed?`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(src, 'utf8'));
  if (!Array.isArray(artifact.abi)) {
    console.error(`${name}: artifact has no 'abi' array — unexpected Foundry format.`);
    process.exit(1);
  }
  writeFileSync(join(abiDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + '\n', 'utf8');
  console.log(`extracted ${name}`);
}

console.log('done');
