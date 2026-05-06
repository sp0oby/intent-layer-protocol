# Smart contracts (Foundry)

**What this is:** the **on-chain skeleton** for Phase 1 — compile-ready Solidity, interfaces, libraries, and starter tests. It is **not** a complete or audited protocol (no production escrow, LayerZero paths, or auction finality yet).

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](../docs/ARCHITECTURE.md) · [MVP specification](../docs/MVP_SPECIFICATION.md)

---

If your editor ever shows **`lib 2`**, **`src 2`**, **`test 2`**, or **`contracts/contracts/`**, those are usually **empty leftovers** from a partial `forge init` or from Finder duplicating folders — **delete them**. You only need one `lib/`, one `src/`, and one `test/` at the `contracts/` root (plus `lib/forge-std/…` inside `lib`).

---

## Layout (standard Foundry)

| Path | Role |
|------|------|
| [`src/`](src/) | [`ChainPeerRegistry.sol`](src/ChainPeerRegistry.sol), [`IntentSettler.sol`](src/IntentSettler.sol), [`SolverAuction.sol`](src/SolverAuction.sol), [`interfaces/`](src/interfaces/), [`libraries/`](src/libraries/) |
| [`test/`](test/) | Your Foundry tests (`*.t.sol`) |
| [`lib/forge-std/`](lib/forge-std/) | **Vendored** [forge-std](https://github.com/foundry-rs/forge-std) — *its* `src/` and `test/` are part of the dependency, **not** a second copy of your protocol |

If your editor shows nested paths like `lib/forge-std/src`, that is **expected** Foundry nesting — not mysterious `src2` / `lib2` directories.

---

## Tooling

- **Config:** [`foundry.toml`](foundry.toml), [`remappings.txt`](remappings.txt)
- **Std / test helpers:** `lib/forge-std` ( tarball checkout so `forge test` works where `git submodule` is restricted )
- **Refresh dependency:** remove `lib/forge-std` and run `forge install foundry-rs/forge-std --no-commit`

```bash
cd contracts
forge build
forge test
```

---

## Design intent (high level)

- **`ChainPeerRegistry`** — per-chain **LayerZero EID** table + **`isRouteSupported`**; owned by deployer until multisig/timelock. Paired with **`IntentSettler(chainRegistry)`** (use `address(0)` only in ephemeral tests).
- **`IntentSettler`** — record intents; enforces **`sourceChainId == block.chainid`** and registry route when configured; escrow + **`lzEidForChain`** in **`_lzSend`** are **TODO** per MVP / Architecture.
- **`SolverAuction`** — shape for solver proposals; ranking and execution **TODO**.
- **Libraries** — hashing and transfer/signature helpers to be hardened (e.g. OpenZeppelin, EIP-712) before mainnet.

Pull requests that change state machines or token flows should cite [`docs/MVP_SPECIFICATION.md`](../docs/MVP_SPECIFICATION.md) and extend tests accordingly.
