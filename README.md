# Intent Layer Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white)](contracts/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](backend/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](frontend/)

**Cross-chain intent settlement for Ethereum ↔ Base** — users express a single high-level swap goal; the system fulfills it via **peer-to-peer intent matching** when possible, or a **competitive solver auction** when not.

This repository contains the **protocol specification**, a **working dev skeleton** (contracts, backend API, web app, CI, Docker), and room for production hardening before any mainnet deployment.

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

**Primary transport (Phase 1):** LayerZero V2. **Optional fallback path:** Chainlink CCIP (design-time; see [Architecture](docs/ARCHITECTURE.md)).

---

## Current status

| Area | State |
|------|--------|
| **Specification** | Protocol design and planning docs live under [`docs/`](#documentation) |
| **Smart contracts** | **Scaffolding** — `IntentSettler` (with optional `ChainPeerRegistry`), `ChainPeerRegistry`, `SolverAuction` compile; **escrow, LayerZero OApp send/receive, and production invariants are not implemented yet** |
| **Backend** | Express API skeleton, in-memory matcher + DB schema stub, indexer placeholder |
| **Frontend** | Next.js app with wallet connect (wagmi), swap + intent status flows wired to a **mock API** |
| **CI** | GitHub Actions: Foundry + backend `tsc`/tests + frontend build ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |

Treat on-chain code as **templates to extend**, not audited production assets.

---

## Repository layout

| Path | Purpose |
|------|---------|
| [`contracts/`](contracts/) | Foundry — **`ChainPeerRegistry`**, `IntentSettler`, `SolverAuction`, interfaces, libraries ([`contracts/README.md`](contracts/README.md)) |
| [`backend/`](backend/) | TypeScript API, matcher stub, migrations — [`backend/README.md`](backend/README.md) |
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

# Contracts — forge-std is vendored under contracts/lib/forge-std
cd contracts && forge build && forge test && cd ..

# Dev servers (separate terminals)
cd backend && npm run dev          # API → http://localhost:4000
cd frontend && npm run dev         # UI  → http://localhost:3000
```

To refresh `forge-std` from upstream instead of the vendored copy:

```bash
cd contracts && forge install foundry-rs/forge-std --no-commit
```

---

## Scripts & quality gates

| Package | Commands |
|---------|----------|
| **Contracts** | `forge build`, `forge test` (from [`contracts/`](contracts/)) |
| **Backend** | `npm run lint` (TypeScript check), `npm test`, `npm run dev` |
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
Yes, periodically — especially before releases. The skeleton may pin versions with known advisories; upgrading (for example **Next.js** patch releases) should be done deliberately with a quick smoke test of the app.

**Are the smart contracts “done”?**  
No. They are **intentional templates**: interfaces, structs, events, and stub logic so the repo builds and tests run. Escrow, messaging, auctions, and economic security must be implemented and reviewed before any deployment.

**Who maintains this?**  
Project founder: **[@sp0oby](https://github.com/sp0oby)**. Contributors welcome per [CONTRIBUTING.md](CONTRIBUTING.md).
