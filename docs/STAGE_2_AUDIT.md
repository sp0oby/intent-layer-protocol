# Stage 2 — LayerZero OApp Integration: Audit & Findings

**Audience:** Maintainers, future external auditors · **Version:** 1.0 · **Status:** Internal review of Stage 2
**Scope:** `contracts/src/IntentSettler.sol` (LayerZero V2 OApp integration), the new mock LayerZero endpoint, and the cross-chain test harness
**Date:** 2026-05-06
**See also:** [Stage 1 audit](STAGE_1_AUDIT.md) · [Architecture](ARCHITECTURE.md) · [MVP specification](MVP_SPECIFICATION.md)

---

## TL;DR

Stage 2 wires `IntentSettler` to LayerZero V2 as a real OApp. `executeMatching` now sends `EXECUTE_MATCH` to the destination chain; the destination's `_lzReceive` releases its escrow to the source user and sends `CONFIRM` back; the source's `_lzReceive` releases its escrow to the dest user. `refundIfLzTimeout` recovers funds from a stuck `Matched` state after 30 minutes.

| Tool / Check | Result |
|---|---|
| `forge build` | ✅ clean (44 contracts) |
| `forge test` | ✅ **71/71 pass** (62 unit/fuzz + 6 LZ + 3 invariants × ~128k random calls) |
| `forge fmt --check` | ✅ clean |
| Slither (medium+) | ✅ **0 findings** across 40 contracts |
| Backend lint + test | ✅ clean (2/2) |
| Frontend lint + build | ✅ clean |

---

## Methodology

1. **Static analysis** with Slither v0.11.5 (`--filter-paths "lib/|test/"`).
2. **Manual line-by-line review** of every new function path against the Stage 7 security checklist + the Stage 1 audit's security invariants.
3. **Cross-chain end-to-end tests** via a custom `MockLzEndpoint` that captures `send()` calls and exposes `deliverNext()` / `dropNext()` for tests to drive the full round-trip.
4. **Stateful invariants** unchanged from Stage 1 (escrow accounting, terminal-state stickiness) — re-run on the Stage 2 contract to confirm packing + LZ changes do not break them.

---

## Design Summary

### Two-leg LayerZero protocol

```
Source chain                                     Destination chain
─────────────────                                ──────────────────
executeMatching(...) ──────────────────────►    _lzReceive(EXECUTE_MATCH)
   • validate state + price                       • validate dest intent Pending
   • Pending → Matched                            • Pending → Settled
   • _lzSend(EXECUTE_MATCH)                       • release dest tokens to sourceUser
                                                  • _lzSend(CONFIRM)
                                                          │
_lzReceive(CONFIRM) ◄──────────────────────────────────────┘
   • validate state == Matched
   • Matched → Settled
   • release source tokens to destUser
```

The CONFIRM message carries `destUser` — read from the destination's own storage, **so a malicious matcher cannot redirect source funds**. The relayer never supplies an authoritative recipient address.

### Payload format (versioned)

```solidity
// EXECUTE_MATCH (source → dest)
abi.encode(uint8 MSG_EXECUTE_MATCH, uint8 MSG_VERSION,
           bytes32 sourceHash, bytes32 destHash, address sourceUser)

// CONFIRM (dest → source)
abi.encode(uint8 MSG_CONFIRM, uint8 MSG_VERSION,
           bytes32 sourceHash, address destUser)
```

The first two bytes (after `abi.encode` padding) are the type discriminator and version. Unknown types and versions revert via `UnknownMessageType` / `UnsupportedMessageVersion`.

### Constructor signature

```solidity
constructor(address chainRegistry_, address lzEndpoint_, address delegate_)
    OApp(lzEndpoint_, delegate_)
    Ownable(delegate_)            // explicit because OZ v5 Ownable requires initialOwner
    EIP712("IntentLayerProtocol", "1")
```

The `Ownable(delegate_)` modifier is required because OAppCore inherits OZ Ownable but does not pass an initial owner — a known incompatibility between LZ devtools v0.4.1 and OZ v5. The most-derived contract resolves it.

---

## Findings Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| H-01 (S1) | High | Stage 1 alone is not deployable | **Closed by Stage 2** — `_lzSend`/`_lzReceive` and `refundIfLzTimeout` are now implemented; `Matched` always has an exit path |
| H-02 | High | Return-leg `_lzSend` from `_lzReceive` cannot reuse `msg.value` | **Resolved** via `_payNative` override |
| M-05 | Medium | Operator must pre-fund the dest settler with native to pay return-leg LZ fees | **Accepted with documented runbook** — see "Operational responsibility" below |
| M-06 | Medium | Mock endpoint deviates from real LayerZero in fee-drop semantics | **Accepted** — mock no longer forwards `nativeFee` to receiver; matches real LZ default |
| L-04 | Low | `_payNative` override loosens the strict `msg.value == fee` invariant | **Accepted** with explicit logic (see below) |

No critical findings. All Stage 1 high-severity items are now closed.

---

## Detailed Findings

### H-02 — Return-leg `_lzSend` from `_lzReceive` cannot reuse `msg.value`

**Severity:** High (would have prevented the protocol from working)
**Where:** `OAppSender._payNative`, called from `_lzSend`
**Status:** Resolved.

#### Description
OApp's `_payNative` requires `msg.value == _nativeFee`. When `_handleExecuteMatch` runs inside `_lzReceive` and calls `_lzSend(srcEid, reply, ...)` to send CONFIRM back, the outer call's `msg.value` is 0 (no value attached to `lzReceive`). Default `_payNative` would revert.

#### Fix
Override `_payNative` to:
1. Accept `msg.value == _nativeFee` (the user-initiated `executeMatching` path).
2. Also accept `msg.value == 0 && address(this).balance >= _nativeFee` (the return-leg path inside `_lzReceive`).
3. Revert otherwise with the original `NotEnoughNative` error.

The override only relaxes the *source* of native — the endpoint still receives the full `_nativeFee` via `endpoint.send{value: _nativeFee}`.

#### Verification
`testLz_fullP2PRoundTrip` exercises both paths in one transaction sequence: outer `executeMatching` (path 1) + nested CONFIRM `_lzSend` (path 2). Both succeed; the contract balance accounting holds.

---

### M-05 — Operator must pre-fund the dest settler for return-leg fees

**Severity:** Medium (operational)
**Where:** `_handleExecuteMatch` calls `_lzSend(srcEid, reply, "", fee, ...)`
**Status:** Accepted with documented runbook.

#### Description
The destination settler pays its own LZ fee for the CONFIRM return message from its native balance. If the contract's balance is insufficient, the call reverts with `InsufficientLzFee` and the source intent stays `Matched` until `LZ_TIMEOUT` (30 min) lets the user refund.

#### Why this trade-off
LayerZero V2 supports an explicit "executor option" called `addExecutorNativeDropOption` that drops native from the source side onto the destination at delivery time. Using it would make the protocol self-funding for return-leg fees and remove the operator burden. We did not implement this for Stage 2 because:

- The options API is more complex and would couple our protocol to LayerZero's executor configuration;
- For MVP volumes (hundreds–thousands of intents/day), a one-time pre-fund + periodic top-up is operationally cheap;
- The accounting is clearer when the operator funds explicitly, especially during the first weeks post-launch.

#### Operational runbook (deploy-time)
1. After deploying `IntentSettler` on each chain, the deployer transfers a pre-fund balance (suggested: 100× `quoteMatching` for the typical corridor) to the contract via plain `receive()` ETH transfer.
2. Monitoring alert when contract balance drops below 10× `quoteMatching` — operator tops up.
3. Phase 2 work item: switch to `addExecutorNativeDropOption` for self-funding, drop the operator dependency.

#### Worst-case outcome if pre-fund runs out
Source intent stuck at `Matched` until 30-minute timeout, then user calls `refundIfLzTimeout` to recover their escrow. **No funds are lost** — only delayed.

---

### M-06 — Mock endpoint deviates from real LayerZero (fee-drop)

**Severity:** Medium (test fidelity)
**Where:** `MockLzEndpoint.deliverNext`
**Status:** Accepted.

#### Description
An earlier version of the mock forwarded `nativeFee` as `msg.value` to the destination's `lzReceive`. Real LayerZero V2 does not do this by default — native drops are an explicit executor option (`addExecutorNativeDropOption`). The first round of LZ tests passed but left 1 wei of "phantom drop" stuck in the source settler after the round-trip.

#### Fix
The mock's `deliverNext` calls `lzReceive` without forwarding any value. Tests now pre-fund the destination settler via `vm.deal` to mirror the production runbook.

#### Verification
`testLz_fullP2PRoundTrip` ends with `assertEq(address(ethSettler).balance, 0)` — passes cleanly. No phantom value remains.

---

### L-04 — `_payNative` override loosens the strict `msg.value == fee` invariant

**Severity:** Low (documented intentional widening)
**Where:** `IntentSettler._payNative`
**Status:** Accepted with explicit reasoning.

#### Description
Default OAppSender `_payNative` rejects calls where `msg.value != _nativeFee` to prevent fee-rounding bugs. Our override accepts `msg.value == 0 && balance >= _nativeFee` for the return-leg path, slightly widening this gate.

#### Why this is safe
- The relaxed branch only triggers when `msg.value == 0`, which is the only way `_lzReceive` invokes `_lzSend`. The user-initiated `executeMatching` path goes through the strict equality check.
- The endpoint still receives the full `_nativeFee` via `endpoint.send{value: ...}`. The override only changes *where* the funds come from (msg.value vs. contract balance), not *how much*.
- Contract balance is gated by `address(this).balance >= _nativeFee`. If the operator pre-fund is depleted, the call reverts with `NotEnoughNative(0)` cleanly — same observable behavior as the original guard.

---

## Logic Gaps Closed in Stage 2

From `IMPLEMENTATION_CHECKLIST.md` "Known Logic Gaps":

| # | Description | Closed |
|---|---|---|
| G3 | If LZ delivery fails after `Matched`, funds are permanently locked | ✅ `refundIfLzTimeout` after 30 min |
| G7 | Base's `_lzReceive` must do match + lock + release atomically | ✅ `_handleExecuteMatch` validates + releases + sends CONFIRM in one call |
| G8 | CONFIRM must carry source-chain hash + dest user | ✅ `(MSG_CONFIRM, version, sourceHash, destUser)` payload |
| G14 | LayerZero EIDs must be deploy-time params | ✅ Constructor takes `lzEndpoint_`; EIDs live in `ChainPeerRegistry` storage |

Plus implicitly:
- The relayer trust risk in `executeMatching` (could lie about `remoteUser`) is **eliminated** by the design — the CONFIRM payload's `destUser` comes from the destination's own storage, not relayer input. The contract no longer accepts a relayer-supplied recipient.

---

## Test Coverage

### New tests in Stage 2

**`IntentSettler.lz.t.sol`** — 6 cross-chain tests:
- `testLz_fullP2PRoundTrip` — full Alice/Bob happy path through both chains via mock endpoint
- `testLz_droppedDelivery_thenRefundIfTimeout` — dropped LZ → refund after 30 min
- `testLz_revertsIfPeerNotSet` — untrusted EID delivery rejected
- `testLz_lzReceive_onlyEndpoint` — direct `lzReceive` from non-endpoint reverts
- `testLz_unknownMessageType_reverts` — `msgType=99` rejected at receive
- `testLz_wrongVersion_reverts` — `version=99` rejected at receive

**`IntentSettler.t.sol`** — 4 new `refundIfLzTimeout` tests:
- `testRefundIfLzTimeout_revertsIfNotMatched` (state guard)
- `testRefundIfLzTimeout_revertsTooEarly` (timeout guard)
- `testRefundIfLzTimeout_refundsAfterTimeout` (happy path)
- `testRefundIfLzTimeout_revertsIfAlreadySettled` (terminal-state guard)

### Total test counts

| Suite | Stage 1 | Stage 2 | Δ |
|-------|--------:|--------:|--:|
| `IntentSettler.t.sol` (unit + fuzz subset) | 30 | 34 | +4 |
| `IntentSettler.lz.t.sol` (NEW) | 0 | 6 | +6 |
| `IntentSettler.invariant.t.sol` | 6 | 6 | unchanged |
| `IntentHash.t.sol` | 4 | 4 | unchanged |
| `SolverAuction.t.sol` | 12 | 12 | unchanged |
| `ChainPeerRegistry.t.sol` | 6 | 6 | unchanged |
| `Integration.t.sol` | 3 | 3 | unchanged |
| **Total** | **61** | **71** | **+10** |

All 71 tests pass, including 3 invariants × 256 runs × ~500 calls ≈ **384,000 random call sequences**. Zero failures. Zero accounting drift.

---

## Gas Snapshot — Stage 2

Selected operations from `.gas-snapshot`. Stage 2 numbers include the LZ wiring; Stage 1 numbers were the pre-OApp baseline.

| Operation | Stage 1 (pre-LZ) | Stage 2 (with LZ) | Δ | Notes |
|-----------|-----------------:|------------------:|--:|-------|
| `submitIntent` (ETH) | 246,728 | 246,787 | +59 | Negligible |
| `submitIntent` (ERC-20) | 343,119 | 343,232 | +113 | Negligible |
| `cancelIntent` (ETH) | 279,061 | 279,301 | +240 | Negligible |
| `openAuction` | 269,787 | 270,012 | +225 | Negligible |
| `executeMatching` (valid) | 269,686 | **545,187** | **+275,501** | LZ endpoint.send overhead |
| `refundIfLzTimeout` (success) | (n/a) | 558,786 | +558k | First implementation |
| `testLz_fullP2PRoundTrip` (full E2E) | (n/a) | 930,578 | +930k | Both chains' totals combined |

The +275k on `executeMatching` is the cost of `endpoint.send`. Real LayerZero mainnet gas is in the same ballpark (~150–300k for a basic OApp message). This is unavoidable and matches the architecture doc's `~150k–200k LZ message` estimate.

---

## Forward-Compatibility (revisited)

Stage 2's design preserves all the forward-compat invariants from Stage 1:

1. **One bytecode per chain, config-driven topology** — preserved. EIDs are storage (registry); peers are storage (`OApp.peers`). No hardcoded EIDs, no hardcoded chain IDs in production paths.
2. **Versioned cross-chain payloads** — implemented (`MSG_VERSION = 1` prefix, unknown versions revert).
3. **Coexisting settler versions** — preserved. A future `IntentSettlerV2` can be deployed alongside V1 with separate `setPeer` mappings, no V1 changes required.
4. **`IntentMeta` packing** — preserved. The OApp inheritance adds OApp's own storage (peers mapping, endpoint immutable) but does not touch our `_meta` or `intents` mappings.
5. **Adding Solana, Arbitrum, etc.** — fully unblocked. Phase 2 and Phase 3 chain additions are now config-only on existing settlers.

---

## Project Understanding (re-confirmed for Stage 2)

The Stage-2 contract:
- Inherits `OApp` (OZ-v5-compatible via the explicit `Ownable(delegate_)` constructor pass).
- Uses storage-driven EID resolution (`registry.lzEidForChain`) — no hardcoded chain IDs.
- Implements two message types with a versioned discriminator.
- Trusts only its own storage for recipient addresses on each side, eliminating the relayer-redirection risk.
- Recovers stuck `Matched` intents via `refundIfLzTimeout` after 30 minutes.

Loose ends remaining for future stages (all tracked in `IMPLEMENTATION_CHECKLIST.md`):
- Stage 3: `SolverAuction` ↔ `IntentSettler` integration (G6, M-03 from Stage 1).
- Stage 4–5: backend indexer, matching loop, frontend wiring.
- Stage 8: deployment script + testnet ops (including the operator pre-fund runbook for M-05).

No loose ends in Stage 2 itself. **Stage 1 + Stage 2 together are now logically complete for the on-chain settlement core** — the protocol can run an end-to-end P2P swap (ETH ↔ USDC across two chains) given a working off-chain matcher and a configured LayerZero endpoint.

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Internal review of Stage 2 — superseded once Stage 3 lands |
| **Reviewer** | Internal (maintainer + AI-assisted review) |
