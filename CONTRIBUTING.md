# Contributing to Intent Layer Protocol

Thank you for helping build cross-chain intent infrastructure. This document explains how we work and what we look for in contributions.

---

## Principles

- **Spec-driven:** Significant behavior changes should align with the [MVP specification](docs/MVP_SPECIFICATION.md) and [Architecture](docs/ARCHITECTURE.md), or the docs should be updated in the same PR.
- **Small, reviewable PRs:** Prefer focused changes over large refactors unless agreed in an issue first.
- **Tests required:** Contract changes must keep `forge test` green; backend and frontend changes should preserve existing tests and add coverage for new logic.
- **No secrets:** Never commit private keys, RPC API keys, or `.env` files. Use [`.env.example`](.env.example) only.
- **Security:** Report vulnerabilities privately — see [**SECURITY.md**](SECURITY.md).

---

## Development setup

See the [README](README.md) **Quickstart**. Minimum checklist:

1. `docker compose up -d` for Postgres / Redis / Anvil (optional for `backend` **Vitest** today, but recommended so `/health` can report `database: true` and matches production-like setup).
2. `cd contracts && forge test`
3. `cd backend && npm install && npm run lint && npm test`
4. `cd frontend && npm install && npm run lint && npm run build`

---

## Branching & commits

- **Default branch:** `main`.
- **Workflow:** short-lived `feature/<topic>` or `fix/<topic>` branches; open a **pull request** into `main`.
- **Commits:** clear, imperative messages (e.g. `feat: add intent cancellation stub`, `fix: correct chain id in matcher test`).

---

## Pull request checklist

- [ ] Describes **what** changed and **why** (link related GitHub Issue if one exists).
- [ ] Keeps **CI green** (Foundry, backend, frontend jobs).
- [ ] Updates **documentation** when behavior or public APIs change.
- [ ] For Solidity: considers **gas**, **reentrancy**, and **cross-chain state** assumptions; does not silently weaken security without discussion.
- [ ] Does not introduce **unlicensed** or **copyleft-incompatible** vendored code without maintainer approval.

---

## Code layout (where to work)

| Area | Path | Notes |
|------|------|--------|
| On-chain | [`contracts/src/`](contracts/src/) | Production logic; keep interfaces in [`contracts/src/interfaces/`](contracts/src/interfaces/) |
| Contract tests | [`contracts/test/`](contracts/test/) | Foundry; extend coverage for new flows |
| Backend | [`backend/src/`](backend/src/) | API, indexer, matching; SQL under [`backend/database/`](backend/database/) |
| Frontend | [`frontend/app/`](frontend/app/) | Routes and API routes; shared UI under [`frontend/components/`](frontend/components/) |

---

## Style & tooling

- **Solidity:** `forge fmt` where applicable; follow existing patterns and OpenZeppelin-style safety as dependencies are introduced.
- **TypeScript:** respect `tsconfig` strictness; prefer explicit types on public exports.
- **React:** client components only when needed (`'use client'`); keep wallet logic in dedicated components/hooks.

---

## Community conduct

Be respectful and assume good intent. Disagreement about architecture is expected; harassment is not.

---

## Questions

Open an **Issue** on GitHub (enable **Discussions** on the repo if you want a lighter-weight Q&A channel). Planned workstreams and maintainer scripts are in [`docs/GITHUB_PROJECT_AND_ISSUES.md`](docs/GITHUB_PROJECT_AND_ISSUES.md).
