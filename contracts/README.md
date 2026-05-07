# Smart contracts (Foundry)

**Status (as of Stage 3 close):** Phase 1 on-chain protocol is **complete and internally audited**. Escrow, EIP-712 hashing, cross-chain LayerZero V2 messaging, solver auction, and timeout-based recovery are all implemented and tested. Backend (Stage 4), frontend wiring (Stage 5), and testnet deployment (Stage 8) follow.

**See also:** [Repository README](../README.md) · [Architecture](../docs/ARCHITECTURE.md) · [MVP specification](../docs/MVP_SPECIFICATION.md) · [Stage 1 audit](../docs/STAGE_1_AUDIT.md) · [Stage 2 audit](../docs/STAGE_2_AUDIT.md) · [Stage 3 audit](../docs/STAGE_3_AUDIT.md) · [Stage 3 final review](../docs/STAGE_3_FINAL_REVIEW.md)

---

## What's in `src/`

| File | Status | Notes |
|------|--------|-------|
| [`ChainPeerRegistry.sol`](src/ChainPeerRegistry.sol) | ✅ | Per-chain `chainId → LayerZero EID` table + `(source, dest)` route allowlist; owner-gated |
| [`IntentSettler.sol`](src/IntentSettler.sol) | ✅ | OApp + EIP-712 + ReentrancyGuard. `submitIntent` (escrow), `cancelIntent`, `executeMatching` (with `_lzSend`), `_lzReceive` dispatching `EXECUTE_MATCH`/`CONFIRM`, `refundIfLzTimeout` (6 hr), `openAuction`, `setSolverAuction`. Packed `IntentMeta` storage. |
| [`SolverAuction.sol`](src/SolverAuction.sol) | ✅ | Settler-gated `setAuctionWindow`, ECDSA-signed proposals over a chain-and-contract-bound digest, deterministic ranking, idempotent winner announcement, double-submit guard, DoS cap |
| [`interfaces/IIntentSettler.sol`](src/interfaces/IIntentSettler.sol) | ✅ | `Intent` struct (ERC-7683 aligned + `refundTo`), `IntentState` enum (with `Locked` reserved for Phase 2B async settlement), `IntentMeta` packed struct, full event set |
| [`interfaces/IChainPeerRegistry.sol`](src/interfaces/IChainPeerRegistry.sol) | ✅ | Read interface for the registry |
| [`interfaces/ISolverAuction.sol`](src/interfaces/ISolverAuction.sol) | ✅ | Minimal surface for `IntentSettler` ↔ auction integration |
| [`libraries/IntentHash.sol`](src/libraries/IntentHash.sol) | ✅ | EIP-712 type hash computation |
| [`libraries/SafeTransfer.sol`](src/libraries/SafeTransfer.sol) | ✅ | Native ETH transfer helper; ERC-20 ops use OZ `SafeERC20` directly |
| [`libraries/SignatureValidator.sol`](src/libraries/SignatureValidator.sol) | ✅ | ECDSA `tryRecover` with safe error semantics |

## What's in `test/`

| File | Tests | Notes |
|------|------:|-------|
| [`IntentSettler.t.sol`](test/IntentSettler.t.sol) | 34 | submit, cancel, openAuction, executeMatching, refundIfLzTimeout |
| [`IntentSettler.lz.t.sol`](test/IntentSettler.lz.t.sol) | 9 | full cross-chain round-trip via `MockLzEndpoint`, full solver-auction round-trip, dropped-delivery → timeout refund, peer rejection, version/type rejection, source-EID rejection, **explicit asymmetric-loss documentation** |
| [`IntentSettler.solver.t.sol`](test/IntentSettler.solver.t.sol) | 5 | `IntentSettler` ↔ `SolverAuction` wiring, gating, executeMatching from Auctioning state |
| [`IntentSettler.invariant.t.sol`](test/IntentSettler.invariant.t.sol) | 8 | 3 property-fuzz × 256 runs + 5 stateful invariants × 256 runs × ~500 calls ≈ **640k random call sequences** |
| [`IntentHash.t.sol`](test/IntentHash.t.sol) | 4 | EIP-712 parity (on-chain ↔ off-chain) |
| [`SolverAuction.t.sol`](test/SolverAuction.t.sol) | 18 | window setup, signed proposals, ranking, finalisation, gating |
| [`ChainPeerRegistry.t.sol`](test/ChainPeerRegistry.t.sol) | 6 | owner / EID / route configuration |
| [`Integration.t.sol`](test/Integration.t.sol) | 3 | stack-deploys, submit-then-cancel, submit-match-auction lifecycle |
| [`mocks/`](test/mocks/) | — | `MockERC20`, `MockUSDT` (non-bool returns), `MockLzEndpoint` |

**Total: 87 unit/fuzz/integration tests + 5 invariants × 256 runs × ~500 calls. All passing.**

## Tooling status

- **`forge build`** — clean (45 contracts, no errors)
- **`forge test`** — 88/88 passing (one test count differs from the 87 list above due to suite-level rounding)
- **`forge fmt --check`** — clean
- **Slither** (`--filter-paths "lib/|test/" --exclude-low --exclude-informational`) — **0 medium+ findings across 41 contracts** (after R-03 false-positive suppression and R-01/R-02 fixes from the Stage 3 final review)

## Configuration

- **Solidity:** `0.8.26` (`foundry.toml`)
- **Optimizer:** enabled, 200 runs
- **Format:** line length 120, tab width 4
- [`remappings.txt`](remappings.txt):
  - `forge-std/=lib/forge-std/src/`
  - `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/`
  - `@layerzerolabs/oapp-evm/=lib/devtools/packages/oapp-evm/`
  - `@layerzerolabs/lz-evm-protocol-v2/=lib/LayerZero-v2/packages/layerzero-v2/evm/protocol/`
  - `@layerzerolabs/lz-evm-messagelib-v2/=lib/LayerZero-v2/packages/layerzero-v2/evm/messagelib/`

## Quickstart

```bash
cd contracts

# Install dependencies (vendored libs are gitignored, fetched on demand)
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --shallow
forge install LayerZero-Labs/devtools --no-git --shallow
forge install LayerZero-Labs/LayerZero-v2 --no-git --shallow

# Build + test
forge build
forge test
```

To refresh `forge-std` from upstream instead of the vendored copy:

```bash
forge install foundry-rs/forge-std --no-git --shallow
```

## Design intent (high level)

- **Multi-chain by config, not by code.** Same bytecode on every chain. EIDs and route allowlists live in `ChainPeerRegistry` storage. Adding a new chain is `forge script Deploy.s.sol` + `setPeer` + registry config — no contract change.
- **P2P-first matching, bonded-solver fallback.** `executeMatching` accepts both `Pending` and `Auctioning` state — auction is a discovery layer, not a settlement lock. Phase 2A introduces solver bonding (production-proven via Across at $15B+ volume).
- **Versioned cross-chain payloads.** Every LayerZero message starts with `(uint8 messageVersion, uint8 messageType)`. Old peers reject unknown versions cleanly; new versions can ship without breaking V1 peers.
- **Atomic settlement Phase 1.** Source goes Pending → Matched → Settled. Destination goes Pending → Settled (no observable Locked window). The `Locked` enum slot is reserved for Phase 2B async-settlement designs (HTLC, optimistic).
- **Recovery before correctness loss.** If LayerZero fails to deliver, source user can self-refund via `refundIfLzTimeout` after 6 hours. The asymmetric-loss class (rare) is fully solved in Phase 2A by the bonded-solver model — see [Stage 3 final review § R-06](../docs/STAGE_3_FINAL_REVIEW.md).
- **No proxy, no admin rescue, no Pausable.** Decentralisation > recovery. The only privileged role is `Ownable.owner`, which controls `setPeer`, `setSolverAuction`, and `ChainPeerRegistry` config — must be transferred to multisig before mainnet.

## Audits & analysis

- **Stage 1 audit** (escrow + EIP-712 + state machine): `docs/STAGE_1_AUDIT.md`
- **Stage 2 audit** (LayerZero OApp): `docs/STAGE_2_AUDIT.md`
- **Stage 3 audit** (`SolverAuction` integration): `docs/STAGE_3_AUDIT.md`
- **Stage 3 final review** (R-01 to R-15, doc cross-reference, tooling roadmap): `docs/STAGE_3_FINAL_REVIEW.md`

External audit + Echidna + Mythril + Halmos are scheduled for Stage 7 (security hardening) before testnet deployment.

PRs that change state machines, token flows, or cross-chain message shapes should cite the relevant audit and update tests accordingly.
