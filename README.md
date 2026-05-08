# Intent Layer Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white)](contracts/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](backend/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](frontend/)

**Cross-chain intent settlement for Ethereum ↔ Base** — users express a single high-level swap goal; the system fulfills it via **peer-to-peer intent matching** when possible, or a **competitive solver auction** when not.

This repository contains the **protocol specification**, the **on-chain protocol** (Foundry — Stages 0–3 complete + follow-up security pass; 100/100 tests, Slither clean), the **off-chain backend** (Stage 4 feature-complete: indexer, matching loop, auction orchestrator, REST + WebSocket API, reference solver bot — 101/101 vitest unit + 4/4 E2E with two real Anvils), a **frontend skeleton** wired to a mock API (Stage 5 wiring is the next milestone), and the CI / Docker / `.env` scaffolding to run it all locally. External audit and testnet/mainnet deployment remain — see [`docs/TIMELINE_CHECKLIST.md`](docs/TIMELINE_CHECKLIST.md).

---

## Table of contents

- [Why this project](#why-this-project)
- [Current status](#current-status)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [For new contributors](#for-new-contributors)
- [Quickstart](#quickstart)
- [Scripts & quality gates](#scripts--quality-gates)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [FAQ](#faq)

---

## Why this project

Bridge UIs today force users to pick routes, absorb stacked slippage, and reason about fragmented liquidity. Intent Layer Protocol aims for **one-step intent expression** and **better pricing** when two opposite intents can be matched directly across chains — with a **transparent solver fallback** when they cannot.

**Where we sit in the cross-chain intent landscape:**

Cross-chain intents are an established and competitive category in 2026 — Across Protocol ($15B+ volume since 2022), UniswapX cross-chain, deBridge DLN, Mayan, Eco Routes, and others all process billions on this exact problem. **We are not first to cross-chain intents.** We are an entrant with one specific differentiator: every existing protocol uses a solver / relayer / bonder as the counterparty; we attempt a **direct P2P match** between two user intents first, with a **bonded solver auction as fallback** (the same model Across uses). When a P2P match exists, the user gets CoW-style direct-swap pricing with no solver fee. When it doesn't, the user gets Across-style solver coverage. We are first to add the P2P-first matching layer to cross-chain intents — but the cross-chain plumbing itself is battle-tested standard infrastructure.

The two-sided market bootstrap problem is solved by `ILP` token rewards to **both** P2P counterparties (Phase 2B), with explicit Sybil mitigations drawn from the LooksRare wash-trading episode. See [Whitepaper § Token Economics](docs/WHITEPAPER.md#token-economics) for the full incentive design.

**Why P2P matters** (full argument in [Whitepaper § Why direct P2P matching matters](docs/WHITEPAPER.md#why-direct-p2p-matching-matters)):

- **Better pricing** — when two users match directly, the trade settles at their mutually-agreed price with no solver margin in between (typical solver spread: 5–30 bps eliminated).
- **More decentralized** — fewer than 20 entities globally are capitalised + tooled enough to run cross-chain solvers. P2P makes any wallet holder a potential counterparty.
- **Censorship-resistant** — P2P matches don't flow through any solver's compliance pipeline.
- **Capital efficient** — no solver capital pre-locked on every chain; the users' own escrows are the liquidity.
- **Anti-fragile** — if every solver goes offline, P2P matching keeps working.

This is why we put the P2P path *first* and the bonded solver auction *second*. Solver-mediated protocols are great at what they do; we use the same model as our fallback. But the P2P match, when it works, is strictly better for the user along every axis.

**Primary transport (Phase 1):** LayerZero V2. **Optional fallback path:** Chainlink CCIP (design-time; see [Architecture](docs/ARCHITECTURE.md)).

---

## Current status

| Area | State |
|------|--------|
| **Specification** | Protocol design and planning docs live under [`docs/`](#documentation) |
| **Smart contracts** | **Stages 1 + 2 + 3 complete + follow-up security pass** — `IntentSettler` is a full LayerZero V2 OApp: EIP-712 hashing, native-ETH + ERC-20 (incl. USDT-style) escrow, `cancelIntent`, `executeMatching` with `_lzSend`, `_lzReceive` dispatching `EXECUTE_MATCH` / `CONFIRM`, `refundIfLzTimeout` (6 hr recovery), `openAuction`, `setSolverAuction`. `SolverAuction` integrated. Match validation (token + chain + both-sides amount minimums) is enforced **on the destination chain using only trusted data** — the matcher cannot bypass `minDestAmount` or `destToken`. CONFIRM leg has the same source-EID guard as EXECUTE_MATCH. User ETH escrow is segregated from operator pre-fund and can never be debited for LayerZero fees. **100/100 tests (94 unit/fuzz/integration + 6 stateful invariants × 256 runs × ~500 calls ≈ 768k random sequences). Slither: 0 medium+ findings across 41 contracts.** |
| **Backend** | **Stage 4 feature-complete** — multi-chain event indexer with resumable cursor, DB-backed matching loop with relayer dispatch, auction orchestrator (open + finalize), REST + WebSocket API, ECDSA proposal verification, reference solver bot, runtime composition. **101/101 vitest unit + 4/4 E2E** (E2E spawns two real Anvil instances and drives a full P2P round-trip with cross-chain LayerZero relay). `tsc --noEmit` clean. |
| **Frontend** | **Stage 5 feature-complete** — Next 16 + React 19 + Tailwind v4 + shadcn/ui + Framer Motion + wagmi v3 + viem + TanStack Query + Zustand. Multi-wallet picker, across-style swap form with combined token+chain picker dialog, indicative-rate auto-fill + slippage selector, real `submitIntent` flow with chained ERC-20 approval, settings popover (deadline + refund-to override), state-driven status page with route preview / live solver-bid feed / per-state tx hash explorer chips, paginated history with chain-overlay token icons, glass-card design system across landing / swap / status / history. **40/40 vitest unit pass, lint + build green, mobile-responsive at 375px.** End-to-end manual flow lands cleanly on the local Anvil pair via `npm run local-stack` (see Quickstart). |
| **CI** | GitHub Actions: Foundry + backend `tsc`/tests + frontend build ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |

The on-chain code is **internally audited and locally tested** but has not yet been through an external audit, testnet, or mainnet deployment. Treat it accordingly.

---

## Repository layout

| Path | Purpose |
|------|---------|
| [`contracts/`](contracts/) | Foundry — **`ChainPeerRegistry`**, `IntentSettler`, `SolverAuction`, interfaces, libraries ([`contracts/README.md`](contracts/README.md)) |
| [`backend/`](backend/) | TypeScript API, multi-chain indexer, DB-backed matching loop, auction orchestrator, WebSocket, reference solver bot — [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend/) | Next.js App Router client — [`frontend/README.md`](frontend/README.md) |
| [`docs/`](docs/) | [Protocol documentation](#documentation) (whitepaper, architecture, MVP, risk, stack, research, timeline) and maintainer guides (GitHub Projects / issues) |
| [`docker-compose.yml`](docker-compose.yml) | Local Postgres, Redis, Anvil |
| [`.env.example`](.env.example) | Non-secret configuration template |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute — branches, PR expectations, review norms |
| [`SECURITY.md`](SECURITY.md) | How to report vulnerabilities privately |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Whitepaper](docs/WHITEPAPER.md) | Vision, market, roadmap |
| [Architecture](docs/ARCHITECTURE.md) | Technical design and layering |
| [MVP specification](docs/MVP_SPECIFICATION.md) | Phase 1 scope and acceptance criteria |
| [Risk analysis](docs/RISK_ANALYSIS.md) | Risks and mitigations |
| [Technology stack](docs/TECH_STACK.md) | Tools, frameworks, infra |
| [Research guide](docs/RESEARCH_CODEBASE_GUIDE.md) | Reference protocols and reading plan |
| [Timeline and checklist](docs/TIMELINE_CHECKLIST.md) | Milestones and checklists |
| [GitHub Projects and issues](docs/GITHUB_PROJECT_AND_ISSUES.md) | Board setup and issue templates |
| [Documentation index (browse `docs/`)](docs/README.md) | Short TOC for the `docs/` folder |

---

## For new contributors

1. Read [**CONTRIBUTING.md**](CONTRIBUTING.md), [**docs/MVP_SPECIFICATION.md**](docs/MVP_SPECIFICATION.md), and [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md) before large changes.
2. Use [**docs/TIMELINE_CHECKLIST.md**](docs/TIMELINE_CHECKLIST.md) and [GitHub Issues](https://github.com/sp0oby/intent-layer-protocol/issues) to pick scoped work; maintainer board setup is in [**docs/GITHUB_PROJECT_AND_ISSUES.md**](docs/GITHUB_PROJECT_AND_ISSUES.md).
3. Run the [**Quickstart**](#quickstart) locally and keep **CI green** (Foundry + backend + frontend) before opening a PR.

---

## Quickstart

**Prerequisites:** Node.js **20** (matches CI; **18+** often works locally), **Docker**, **Foundry** (`forge`, `anvil`).

```bash
git clone https://github.com/sp0oby/intent-layer-protocol.git
cd intent-layer-protocol
cp .env.example .env   # fill RPC URLs as needed; never commit secrets

# Dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Local infra (Postgres, Redis, Anvil)
docker compose up -d

# Contracts — forge-std is vendored under contracts/lib/forge-std.
# OpenZeppelin and LayerZero are not committed (size); install once per clone:
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --shallow
forge install LayerZero-Labs/devtools --no-git --shallow
forge install LayerZero-Labs/LayerZero-v2 --no-git --shallow
forge build && forge test
cd ..

# Dev servers (separate terminals)
cd backend && npm run dev          # API → http://localhost:4000
cd frontend && npm run dev         # UI  → http://localhost:3000
```

### One-command local stack (recommended for frontend testing)

The `local-stack` script spawns two Anvil instances, deploys the contract
stack on each, and boots the entire backend (4 indexers + matching loop
+ auction orchestrator + LayerZero relayer + solver bot + REST/WS API)
in a single process. No Postgres needed (in-memory repo), no `.env`
tweaks — it writes the freshly-deployed addresses to
`frontend/.env.local` for you.

```bash
cd backend && npm run local-stack
# in another terminal:
cd frontend && npm run dev
```

Open `http://localhost:3000`, connect MetaMask to **Anvil Eth (chain 31337,
RPC `http://127.0.0.1:38545`)** or **Anvil Base (chain 31338, RPC
`http://127.0.0.1:38546`)**, and submit a swap. The bundled solver bot
will bid on the auction so you'll see the full
`PENDING → AUCTIONING → MATCHED → SETTLED` flow end-to-end.

To refresh `forge-std` from upstream instead of the vendored copy:

```bash
cd contracts && forge install foundry-rs/forge-std --no-git --shallow
```

---

## Scripts & quality gates

| Package | Commands |
|---------|----------|
| **Contracts** | `forge build`, `forge test` (from [`contracts/`](contracts/)) |
| **Backend** | `npm run lint` (TypeScript check), `npm test`, `npm run test:e2e` (spawns Anvil), `npm run dev`, `npm run extract-abis` (refresh `src/abis/` from `contracts/out/`) |
| **Frontend** | `npm run lint`, `npm run build`, `npm run dev` |
| **CI** | See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

---

## Maintainers

Backlog hygiene only (GitHub Projects, labels, bootstrapping issues): see [**docs/GITHUB_PROJECT_AND_ISSUES.md**](docs/GITHUB_PROJECT_AND_ISSUES.md). Typical contributors can skip this.

---

## Contributing

We welcome issues and PRs. Read [**CONTRIBUTING.md**](CONTRIBUTING.md) for branch policy, review expectations, and what to include in a pull request.

---

## Security

This codebase is **early-stage**. **Do not** assume safety for real funds.

- Use internal review, **Slither**, and **Foundry fuzzing** during development.
- Schedule **external audits** before high-limit or broad mainnet exposure when budget allows ([Risk analysis](docs/RISK_ANALYSIS.md)).
- Report suspected vulnerabilities per [**SECURITY.md**](SECURITY.md) (private GitHub advisory preferred).

---

## License

Distributed under the [MIT License](LICENSE).

---

## FAQ

**Should I run `npm audit`?**  
Yes, periodically — especially before releases. Pinned versions may have known advisories; upgrading (for example **Next.js** patch releases) should be done deliberately with a quick smoke test of the app.

**Are the smart contracts "done"?**  
**Phase 1 logic is implemented and internally audited.** Escrow (native ETH + ERC-20 incl. USDT-style), EIP-712 hashing, cross-chain LayerZero V2 messaging, solver auction with signed proposals, and timeout-based recovery all exist with **100/100 tests** including a full cross-chain round-trip and ~768k stateful invariant calls; **Slither shows 0 medium+ findings**. What remains before mainnet: **external audit** (Trail of Bits / OpenZeppelin / Spearbit class), **Echidna / Mythril / Halmos** symbolic + fuzz passes (Stage 7), **testnet deployment** (Stage 8), and the canonical multi-chain peer / registry configuration that comes with it. See [`docs/STAGE_3_FINAL_REVIEW.md`](docs/STAGE_3_FINAL_REVIEW.md) for the full pre-Stage-4 review.

**Is the backend "done"?**  
**Stage 4 is feature-complete locally.** Multi-chain event indexer with resumable cursor, DB-backed matching loop with relayer dispatch, auction orchestrator (open + finalize), REST + WebSocket API with on-chain `proposalDigest` ECDSA verification, reference solver bot, and runtime composition all exist with **101/101 vitest unit + 4/4 E2E** (the E2E spawns two real Anvil instances and drives a P2P swap end-to-end through a real LayerZero relay between two `MockLzEndpoint` instances). Production hardening (monitoring, alerting, multi-instance HA) is Stage 9.

**Is the frontend "done"?**  
**Stage 5 is feature-complete.** Multi-wallet picker, across-style combined token+chain picker dialog, indicative-rate UX with slippage selector, real `submitIntent` flow with chained ERC-20 approval, status page with state-driven route preview + live solver-bid feed + per-state tx hash explorer chips, paginated history with chain-overlay token icons, glass-card design system across landing / swap / status / history, mobile-responsive at 375px. Settings popover for deadline + refund-to override. Lint + build + 40/40 vitest unit pass green. The end-to-end manual flow runs cleanly against the bundled local-stack (`cd backend && npm run local-stack`). Production hardening (Sepolia testnet deploy, real price feed in place of `lib/rates.ts`) is Stage 8.

**Who maintains this?**  
Project founder: **[@sp0oby](https://github.com/sp0oby)**. Contributors welcome per [CONTRIBUTING.md](CONTRIBUTING.md).
