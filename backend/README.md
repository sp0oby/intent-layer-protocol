# Backend — Intent Layer Protocol

**Stack:** Node.js 18+, TypeScript, **Express**, **ethers v6**, **PostgreSQL** (via `pg`), **Vitest** for tests.

**Role in the repo:** Off-chain services — REST API for solvers/frontends, **in-memory matching stub**, **indexer placeholder** for `IntentSubmitted`-style events, and SQL migrations for the order-book schema.

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](../docs/ARCHITECTURE.md) · [Technology stack](../docs/TECH_STACK.md)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | `tsx watch` — API on port `4000` (override with `API_PORT`) |
| `npm run build` | Emit `dist/` with `tsc` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run lint` | `tsc --noEmit` (typecheck) |
| `npm test` | Vitest |

---

## Configuration

Copy [`.env.example`](../.env.example) to `.env` at repo root or set variables in your shell. Defaults assume Docker Compose Postgres on `localhost:5432`.

---

## Layout

| Path | Role |
|------|------|
| [`src/server.ts`](src/server.ts) | Express app factory (`createApp`) |
| [`src/index.ts`](src/index.ts) | HTTP listen entry |
| [`src/services/matching.ts`](src/services/matching.ts) | Opposite-intent matcher stub |
| [`src/services/indexer.ts`](src/services/indexer.ts) | Blockchain listener placeholder |
| [`database/migrations/`](database/migrations/) | Postgres DDL |

---

## Contributing

Open PRs with tests for matching and API changes; keep `npm run lint` and `npm test` passing per [CONTRIBUTING.md](../CONTRIBUTING.md).
