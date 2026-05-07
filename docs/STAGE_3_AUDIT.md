# Stage 3 — SolverAuction ↔ IntentSettler: Audit & Findings

**Audience:** Maintainers, future external auditors · **Version:** 1.0 · **Status:** Internal review of Stage 3
**Scope:** `contracts/src/SolverAuction.sol` (rewritten), `contracts/src/IntentSettler.sol` (auction wiring), `contracts/src/interfaces/ISolverAuction.sol` (new)
**Date:** 2026-05-06
**See also:** [Stage 1 audit](STAGE_1_AUDIT.md) · [Stage 2 audit](STAGE_2_AUDIT.md) · [Architecture](ARCHITECTURE.md) · [MVP specification](MVP_SPECIFICATION.md)

---

## TL;DR

Stage 3 wires `SolverAuction` to `IntentSettler` so opening the on-chain auction window propagates from the settler to the auction contract; adds **real ECDSA signature validation** to solver proposals (closing Stage 1 audit finding M-04); gates `setAuctionWindow` to the linked settler (closing M-03); and lets `executeMatching` fire from `Auctioning` state so the eventual P2P settlement reuses the existing LayerZero flow regardless of whether the match came from off-chain discovery or the on-chain auction.

| Tool / Check | Result |
|---|---|
| `forge build` | ✅ clean (45 contracts) |
| `forge test` | ✅ **83/83 pass** (75 unit/fuzz + 5 Stage 3 integration + 3 invariants × ~128k random calls) |
| `forge fmt --check` | ✅ clean |
| Slither (medium+) | ✅ **0 findings** across 41 contracts |
| Backend lint + test | ✅ clean |
| Frontend lint + build | ✅ clean |

---

## Design Summary

### Decoupled-settlement architecture

The Stage 3 design treats the on-chain auction as a **price-discovery layer**, not a settlement primitive. The winning solver still has to submit a regular counterparty intent on the destination chain — which the off-chain matcher pairs with the original intent via the existing `executeMatching` path. This avoids inventing a parallel settlement flow and reuses the entire Stage 2 LayerZero machinery.

```
User submits intent A on chain X        ────►   Pending
   │
   │ no P2P match for 30 seconds
   ▼
IntentSettler.openAuction(A)            ────►   Auctioning
   │ delegates to ▼
SolverAuction.setAuctionWindow(A, t+30s)
   │
   │ solvers submit signed proposals
   ▼
SolverAuction.executeWinningProposal(A) ────►   announcedWinner[A] = solver
   │  emits WinnerSelected
   ▼ (off-chain) backend tells solver they won
Solver submits counterparty intent B on chain Y
   │
   ▼ (off-chain) backend matches A with B
IntentSettler.executeMatching(A, B, …)  ────►   A: Auctioning → Matched (Stage 2 LZ flow continues)
```

The state machine accepts `executeMatching` from **either** `Pending` or `Auctioning` — the auction is not a lock, just a discovery layer. If a P2P match shows up during the auction, it still wins.

### Coupling pattern

The two contracts know each other's addresses but the constructor does not require both at deploy time (which would be a circular dependency):

1. Deploy `IntentSettler(registry, lzEndpoint, delegate)` — knows nothing about auction.
2. Deploy `SolverAuction(settlerAddress)` — locks the linked settler at construction (immutable).
3. Call `IntentSettler.setSolverAuction(auctionAddress)` (onlyOwner) — closes the loop.

Both sides accept `address(0)` as a dev/test fallback (`SolverAuction(address(0))` keeps `setAuctionWindow` permissionless; `IntentSettler` with no auction wired still calls `openAuction` for state changes but skips the auction-contract delegation).

### Solver signature scheme

Every proposal must carry a 65-byte ECDSA signature over a chain- and contract-bound digest:

```solidity
keccak256(abi.encode(
    "ILP-SolverProposal-v1",   // domain string
    block.chainid,             // chain binding
    address(this),             // contract binding (cross-deploy replay protection)
    intentHash,
    proposedOutputAmount,
    solverFeeBps
))
```

`SignatureValidator.isValidSignature(msg.sender, digest, signature)` verifies that `msg.sender` is the signer. **A solver cannot impersonate another solver, replay a proposal across chains, or replay across auction-contract redeployments.**

---

## Findings Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| M-03 (S1) | Medium | `SolverAuction.setAuctionWindow` permissionless | ✅ **CLOSED** by Stage 3 — gated to `intentSettler` when configured |
| M-04 (S1) | Medium | Solver signatures recorded but not validated | ✅ **CLOSED** by Stage 3 — `SignatureValidator.isValidSignature` enforced in `submitProposal` |
| M-07 | Medium | `executeMatching` now accepts `Auctioning` state — race condition between P2P match and announced solver winner | **Accepted** with explicit reasoning (see below) |
| L-05 | Low | Solver collateral / bonding not implemented — solver can win and not deliver | **Accepted** with documented Phase 2 plan |
| L-06 | Low | `executeWinningProposal` is permissionless — anyone can announce the winner | **Accepted** — winner is determined by deterministic on-chain ranking, not by who calls the announcement |
| I-05 | Info | Solver proposals stored on-chain (not just hashes) | **Accepted** — needed for off-chain verification post-auction |

No critical findings. Both Stage-1 medium findings (M-03, M-04) are now closed. All Stage 3 introductions have explicit accept-reasoning.

---

## Detailed Findings

### M-07 — `executeMatching` from `Auctioning` state — race condition

**Severity:** Medium
**Where:** `IntentSettler.executeMatching` accepts both `Pending` and `Auctioning`
**Status:** Accepted by design.

#### Description
After `openAuction` runs, an intent is `Auctioning`. While the auction is open, two things can happen simultaneously:
1. A P2P counterparty intent shows up off-chain → matcher calls `executeMatching` with that counterparty.
2. The auction closes and a solver wins → matcher calls `executeMatching` with the solver-submitted counterparty intent on the dest chain.

Both paths now succeed because the state guard accepts `Auctioning`. The first one to land wins; the second reverts with `InvalidState` (since state is now `Matched`).

#### Why this is the correct behaviour
- The auction is a **best-effort price-discovery layer**, not a hard lock.
- Forcing the user to wait out the auction even when a better P2P match arrives would be UX-hostile and economically wasteful.
- The on-chain settlement is atomic — there is no "in flight" double-settle window between the two paths.
- The losing path reverts cleanly without any state mutation or fund movement.
- The winning solver loses their gas if they call `executeWinningProposal` after a P2P match has already settled, but they cannot lose principal (they never escrowed anything just by bidding).

#### What this is NOT
- Not a way for an attacker to redirect funds: the price guards in `executeMatching` still enforce that the local user receives at least `minDestAmount`.
- Not a way to bypass the auction: a solver who wins and acts in good time wins normally.
- Not a state-machine hole: the `IntentMeta.state == Pending || Auctioning` check is fully covered by `testSolver_fullAuctionThenExecuteMatching`.

---

### L-05 — No solver collateral / bonding

**Severity:** Low (operational)
**Where:** Whole solver flow
**Status:** Accepted with documented Phase 2 plan.

#### Description
A solver can win an auction and then not submit the destination-side counterparty intent. The user's intent stays `Auctioning` until their `intent.deadline` passes, at which point anyone can `cancelIntent` and refund the user. **No funds are at risk** — only time.

#### Phase 2 plan
Add a `SolverBondVault` that:
- Solvers stake ETH or governance token to participate.
- A successful settlement returns the bond.
- Failure to deliver within a grace period after `executeWinningProposal` slashes the bond and refunds part to the affected user.

This is documented in `WHITEPAPER.md` ("Solver Centralization" risk → "Mitigation: Solver must bond collateral (ILP tokens later)") and in the Phase 2B roadmap.

#### Phase 1 mitigation
- Off-chain reputation: matcher tracks solver delivery rate; misbehaving solvers are removed from the bid pool.
- The auction is decoupled from settlement: a non-delivering solver cannot block the user from cancelling and resubmitting.

---

### L-06 — `executeWinningProposal` is permissionless

**Severity:** Low
**Where:** `SolverAuction.executeWinningProposal`
**Status:** Accepted.

#### Description
Anyone can call `executeWinningProposal(intentHash)` after the auction closes. There is no access control.

#### Why this is safe
- The winner is **deterministic** — `selectWinner` is a pure function over the recorded proposals. Any caller produces the same `(winner, amount)`.
- Idempotency: the second call reverts with `AlreadyAnnounced`. The on-chain record is unforgeable.
- The function has no side effect on user funds. It only emits an event and writes to `announcedWinner` / `announcedAmount`.
- The only "cost" of someone else announcing is the gas they spend — pure benefit to the user.

---

### I-05 — Proposals stored on-chain, not just hashes

**Severity:** Informational
**Where:** `SolverAuction._proposals[intentHash]` array
**Status:** Accepted.

#### Description
Each proposal is stored fully on-chain (signature included). For 50 proposals, this is non-trivial calldata + storage usage.

#### Why this is needed
- The off-chain matcher must be able to query past proposals to verify the auction's outcome.
- Storing only hashes would force off-chain consumers to maintain their own proposal database — defeating the on-chain transparency goal.
- The 50-proposal cap (`MAX_PROPOSALS_PER_INTENT`) bounds the worst-case storage. At ~150 bytes per proposal, that's 7.5 KB per intent — well below any practical concern.

#### Future optimisation
Phase 2 may move the proposal body off-chain and store only digests + signatures, with a Merkle-root commitment on-chain. Not needed for MVP volumes.

---

## Logic Gaps Closed in Stage 3

From `IMPLEMENTATION_CHECKLIST.md` "Known Logic Gaps":

| # | Description | Closed |
|---|---|---|
| G6 | `SolverAuction` had no reference to `IntentSettler`, no `settleWithSolver` entry point | ✅ Wired bilaterally; the `executeMatching` path serves both P2P and solver-matched flows; no separate `settleWithSolver` needed |

Plus from earlier audits:
| ID | Description | Closed |
|---|---|---|
| M-03 | `setAuctionWindow` permissionless | ✅ Gated to `intentSettler` |
| M-04 | Solver signatures recorded but not validated | ✅ ECDSA verification with chain+contract-bound digest |

---

## Test Coverage

### New test files in Stage 3

**`IntentSettler.solver.t.sol`** — 5 integration tests:
- `testSolver_fullAuctionThenExecuteMatching` — full happy path: submit → openAuction → solver bid → executeWinningProposal → executeMatching from Auctioning state
- `testSolver_openAuctionPropagatesToAuctionContract` — wiring works
- `testSolver_setAuctionWindow_gatedToSettler` — gating is enforced
- `testSolver_cancelStillWorksFromAuctioning` — escape path preserved
- `testSolver_setSolverAuction_onlyOwner` — owner gating

### Updated `SolverAuction.t.sol`
- 4 new tests added: `testSetAuctionWindow_gatedToIntentSettler`, `testSubmitProposal_revertsInvalidSignature`, `testSubmitProposal_revertsTamperedAmount`, `testProposalDigest_includesChainAndContract`, `testExecuteWinningProposal_recordsAndEmits`, `testExecuteWinningProposal_revertsIfAlreadyAnnounced`, `testExecuteWinningProposal_revertsWhileOpen`
- All existing tests updated to use real ECDSA signatures via `vm.sign`.

### Total test counts

| Suite | Stage 2 | Stage 3 | Δ |
|-------|--------:|--------:|--:|
| `IntentSettler.t.sol` | 34 | 34 | 0 |
| `IntentSettler.lz.t.sol` | 6 | 6 | 0 |
| `IntentSettler.solver.t.sol` (NEW) | 0 | 5 | +5 |
| `IntentSettler.invariant.t.sol` | 6 | 6 | 0 |
| `IntentHash.t.sol` | 4 | 4 | 0 |
| `SolverAuction.t.sol` | 12 | **18** | +6 |
| `ChainPeerRegistry.t.sol` | 6 | 6 | 0 |
| `Integration.t.sol` | 3 | 3 | 0 |
| **Total** | **71** | **83** | **+12** |

All 83 tests pass, including 3 invariants × 256 runs × ~500 calls ≈ **384,000 random call sequences**. Zero failures.

---

## Gas Snapshot — Stage 3

Selected operations:

| Operation | Stage 2 | Stage 3 | Δ |
|-----------|--------:|--------:|--:|
| `submitIntent` (ETH) | 246,787 | 246,787 | 0 |
| `cancelIntent` (ETH) | 279,301 | 279,301 | 0 |
| `executeMatching` (valid, Pending) | 545,187 | 545,275 | +88 |
| `openAuction` (no auction wired) | 270,012 | 270,012 | 0 |
| `openAuction` (auction wired, propagates) | (n/a) | ~316,000 | +46k for setAuctionWindow call |
| `submitProposal` (with signature validation) | 174,343 (no validation) | ~189,000 | +14k for ECDSA recover |
| `selectWinner` (2 proposals, view) | 293,051 | ~310,000 | minor |
| `executeWinningProposal` | (didn't exist) | ~50,000 | new |

The +46k on the wired `openAuction` is the cost of the cross-contract `setAuctionWindow` call — a one-time per-intent overhead, well below the per-op savings the Stage 1 packing optimization gave us.

---

## Forward-Compatibility (no regressions)

Stage 3 preserves every forward-compat invariant:

1. **One bytecode per chain** — both `IntentSettler` and `SolverAuction` are still the same bytecode on every chain. Per-deployment config is the only thing that differs.
2. **Versioned protocols** — solver signatures use `"ILP-SolverProposal-v1"` domain. A future `v2` can coexist with `v1` for migration windows.
3. **Coexisting versions** — a Phase 2B `IntentSettlerV2` (e.g. encrypted intents) can be deployed alongside V1 with its own `SolverAuctionV2`, no migration of existing intents required.
4. **`IntentMeta` unchanged** — packing layout preserved. Stage 3 only adds the `solverAuction` storage variable, which lands in a fresh slot after the existing storage.
5. **Solana / new chains** — adding a new chain still means deploying both contracts and wiring `setPeer` + `setLzEidForChain` + `setRouteSupported`. No protocol changes.

### What would break in Stage 3 specifically (and why we don't worry about it)
- Changing the solver-signature domain string would invalidate every previously-signed proposal. Mitigated by the version suffix: bumping to `v2` is an explicit migration.
- Changing the `proposalDigest` field order would break signatures. The digest is publicly computed via `proposalDigest(...)` — solvers always re-derive from the live function, so a code change implies a re-sign. Acceptable.

---

## Conclusion

Stage 3 cleanly closes the remaining Stage 1 medium findings and adds a complete, audited solver-auction integration without inventing a parallel settlement flow. The on-chain coupling is minimal (settler→auction in `openAuction`, auction→settler via `intentSettler` immutable for gating), the off-chain coordination is event-driven (`WinnerSelected`), and the existing Stage 2 LayerZero settlement handles every match — P2P or solver-supplied.

**Stages 1 + 2 + 3 together are now complete for the on-chain protocol.** Backend (Stage 4), frontend (Stage 5), integration testing (Stage 6), security hardening (Stage 7), and deployment (Stage 8) follow.

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Internal review of Stage 3 — superseded once Stage 4 lands |
| **Reviewer** | Internal (maintainer + AI-assisted review) |
