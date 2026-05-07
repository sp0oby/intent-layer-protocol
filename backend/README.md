# Backend — Intent Layer Protocol

**Stack:** Node.js **20** (CI version; 18+ often works), TypeScript, **Express**, **ethers v6**, **PostgreSQL** (via `pg`), **Vitest** for tests.

**Role in the repo:** Off-chain services — REST API for solvers/frontends, **in-memory matching stub**, **indexer placeholder** for `IntentSubmitted`-style events, and SQL migrations for the order-book schema.

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](../docs/ARCHITECTURE.md) · [Technology stack](../docs/TECH_STACK.md) · [Stage 3 final review](../docs/STAGE_3_FINAL_REVIEW.md)

---

## Stage 4 status

The on-chain protocol is locked at commit `e47e988` (Stages 0–3 + follow-up security pass). This package is the off-chain side that consumes the contracts. Currently:

- **Schema** aligned with the finalised `Intent` struct + `IntentState` enum (migration `002_align_with_contract.sql`); Postgres-backed indexer cursor table in place.
- **Matcher** mirrors the on-chain types, considers `Pending` and `Auctioning` intents, filters by `deadline`. Still in-memory pending W4-02.
- **Indexer**, **auction orchestrator**, **solver REST/WS API**, and **reference solver bot** are pending — see GitHub issues #22–#26.

The matcher's filter is an **efficiency optimisation, not a security boundary** — destination contract independently re-validates token, chain, and both-sides minimums against authoritative payload data (`docs/STAGE_3_FINAL_REVIEW.md` § R-16). A buggy matcher cannot violate either user's signed `minDestAmount` or `destToken`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | `tsx watch` — API on port `4000` (override with `API_PORT`) |
| `npm run build` | Emit `dist/` with `tsc` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run lint` | `tsc --noEmit` (typecheck) |
| `npm test` | Vitest |
| `npm run extract-abis` | Re-extract `src/abis/*.json` from `contracts/out/` (run after `forge build`) |

---

## Configuration

Copy [`.env.example`](../.env.example) to `.env` at repo root or set variables in your shell. Defaults assume Docker Compose Postgres on `localhost:5432`.

---

## Layout

| Path | Role |
|------|------|
| [`src/server.ts`](src/server.ts) | Express app factory (`createApp`); `/health`, `/api/intents/unmatched`, `/api/solver/proposals` (501 until W4-04) |
| [`src/index.ts`](src/index.ts) | HTTP listen entry |
| [`src/abis/`](src/abis/) | ABI-only JSON extracted from Foundry artifacts (regenerate via `npm run extract-abis`) |
| [`src/types/intent.ts`](src/types/intent.ts) | Canonical TypeScript shapes mirroring `IIntentSettler.Intent` / `IntentMeta` / `IntentState` |
| [`src/services/matching.ts`](src/services/matching.ts) | `IntentRecord` type (mirrors on-chain `Intent` struct) + `findOppositeIntent` + `InMemoryOrderBook` |
| [`src/services/indexer.ts`](src/services/indexer.ts) | Blockchain listener placeholder (W4-01) |
| [`src/db/pool.ts`](src/db/pool.ts) | `pg.Pool` factory + healthcheck |
| [`database/migrations/`](database/migrations/) | Postgres DDL — `001_init.sql`, `002_align_with_contract.sql` |
| [`scripts/extract-abis.mjs`](scripts/extract-abis.mjs) | Foundry artifact → ABI-only JSON extractor (95%+ size reduction) |
| [`tests/`](tests/) | Vitest specs |

---

## API surface

| Method + path | Status | Notes |
|---|---|---|
| `GET /health` | ✅ live | Returns `{ok, database}` (probes pg) |
| `GET /api/intents/unmatched` | 🟡 in-memory | Returns match-eligible intents (`Pending` or `Auctioning`, not expired). Becomes Postgres-backed in W4-02. |
| `POST /api/solver/proposals` | ⚠️ 501 | Real handler must verify `SolverAuction.proposalDigest` ECDSA signature before persisting. Wired in W4-04. |

The previous `/api/intents/mock` endpoint was removed because it bypassed the on-chain submission flow that the indexer-driven model relies on.

---

## Contributing

Open PRs with tests for matching and API changes; keep `npm run lint` and `npm test` passing per [CONTRIBUTING.md](../CONTRIBUTING.md).
