#!/usr/bin/env node
// Extract ABI-only JSON from Foundry artifacts into backend/src/abis/.
//
// Foundry writes a single artifact per contract under `contracts/out/<file>.sol/<Name>.json`.
// Each artifact is ~50–650KB because it includes bytecode, deployedBytecode,
// metadata, sourceMap, etc. The backend only needs the `abi` field, so we
// extract that into a small standalone JSON the runtime imports directly.
//
// Run from repo root or the backend dir — paths are resolved relative to
// this script's location.

import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outDir = join(repoRoot, 'contracts', 'out');
const abiDir = join(repoRoot, 'backend', 'src', 'abis');

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

let totalBytesIn = 0;
let totalBytesOut = 0;
for (const {sol, name} of targets) {
  const src = join(outDir, sol, `${name}.json`);
  if (!existsSync(src)) {
    console.error(`Artifact missing: ${src}. Did 'forge build' succeed?`);
    process.exit(1);
  }
  const raw = readFileSync(src);
  totalBytesIn += raw.length;
  const artifact = JSON.parse(raw.toString('utf8'));
  if (!Array.isArray(artifact.abi)) {
    console.error(`${name}: artifact has no 'abi' array — unexpected Foundry format.`);
    process.exit(1);
  }
  const dest = join(abiDir, `${name}.json`);
  const json = JSON.stringify(artifact.abi, null, 2) + '\n';
  writeFileSync(dest, json, 'utf8');
  totalBytesOut += Buffer.byteLength(json, 'utf8');
  console.log(`extracted ${name} → ${dest} (${raw.length} → ${Buffer.byteLength(json, 'utf8')} bytes)`);
}

console.log(`done — total ${totalBytesIn} → ${totalBytesOut} bytes (${((1 - totalBytesOut / totalBytesIn) * 100).toFixed(1)}% smaller)`);
