# Intent Protocol Layer

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
- [Quickstart](#quickstart)
- [Scripts & quality gates](#scripts--quality-gates)
- [Project board and issues (maintainers)](#project-board-and-issues-maintainers)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [FAQ](#faq)

---

## Why this project

Bridge UIs today force users to pick routes, absorb stacked slippage, and reason about fragmented liquidity. Intent Layer aims for **one-step intent expression** and **better pricing** when two opposite intents can be matched directly across chains — with a **transparent solver fallback** when they cannot.

**Primary transport (Phase 1):** LayerZero V2. **Optional fallback path:** Chainlink CCIP (design-time; see [Architecture](docs/ARCHITECTURE.md)).

---

## Current status

| Area | State |
|------|--------|
| **Specification** | Protocol design and planning docs live under [`docs/`](#documentation) |
| **Smart contracts** | **Scaffolding only** — `IntentSettler` and `SolverAuction` compile and are covered by starter tests; **escrow, LayerZero, and production invariants are not implemented yet** |
| **Backend** | Express API skeleton, in-memory matcher + DB schema stub, indexer placeholder |
| **Frontend** | Next.js app with wallet connect (wagmi), swap + intent status flows wired to a **mock API** |
| **CI** | GitHub Actions: Foundry + backend `tsc`/tests + frontend build ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |

Treat on-chain code as **templates to extend**, not audited production assets.

---

## Repository layout

| Path | Purpose |
|------|---------|
| [`contracts/`](contracts/) | Foundry project — protocol Solidity **stubs** + [`lib/forge-std`](contracts/lib/forge-std) (test library, vendored). See [`contracts/README.md`](contracts/README.md). |
| [`backend/`](backend/) | TypeScript API, matcher stub, migrations — [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend/) | Next.js App Router client — [`frontend/README.md`](frontend/README.md) |
| [`docs/`](docs/) | [Protocol documentation](#documentation) (whitepaper, architecture, MVP, risk, stack, research, timeline) and maintainer guides (GitHub Projects / issues) |
| [`docker-compose.yml`](docker-compose.yml) | Local Postgres, Redis, Anvil |
| [`.env.example`](.env.example) | Non-secret configuration template |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute — branches, PR expectations, review norms |

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

---

## Quickstart

**Prerequisites:** Node.js **18+**, **Docker**, **Foundry** (`forge`, `anvil`).

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

## Project board and issues (maintainers)

After `gh auth login` and `gh auth refresh -s project`, run:

```bash
./scripts/bootstrap-github-project-and-issues.sh
```

This creates a GitHub **Project** titled `Intent Layer MVP` (override with `GITHUB_PROJECT_TITLE`), links it to this repo, and opens labeled **issues** for Week 1–4 work. Rename board columns in the GitHub UI if you want `Backlog / In progress / Review / Done`.

**If linking failed** with `different owner from '@me'`, that happened because `gh project link` expects `--repo intent-layer-protocol` (short name), not `owner/repo`. Fix: pull latest script, or run `gh project link 1 --owner sp0oby --repo intent-layer-protocol`. To reuse project **1** and run the rest (labels + issues): `EXISTING_PROJECT_NUMBER=1 ./scripts/bootstrap-github-project-and-issues.sh`. Link only: add `SKIP_ISSUES=1`.

Manual templates and copy-paste bodies also live in [`docs/GITHUB_PROJECT_AND_ISSUES.md`](docs/GITHUB_PROJECT_AND_ISSUES.md).

---

## Contributing

We welcome issues and PRs. Read [**CONTRIBUTING.md**](CONTRIBUTING.md) for branch policy, review expectations, and what to include in a pull request.

---

## Security

This codebase is **early-stage**. **Do not** assume safety for real funds.

- Use internal review, **Slither**, and **Foundry fuzzing** during development.
- Schedule **external audits** before high-limit or broad mainnet exposure when budget allows ([Risk analysis](docs/RISK_ANALYSIS.md)).
- Report suspected vulnerabilities responsibly (process TBD; open a private security advisory on GitHub if enabled).

---

## License

Distributed under the [MIT License](LICENSE).

---

## FAQ

**Are the smart contracts “done”?**  
No. They are **intentional templates**: interfaces, structs, events, and stub logic so the repo builds and tests run. Escrow, messaging, auctions, and economic security must be implemented and reviewed before any deployment.

**Who maintains this?**  
Project founder: **[@sp0oby](https://github.com/sp0oby)**. Contributors welcome per [CONTRIBUTING.md](CONTRIBUTING.md).
