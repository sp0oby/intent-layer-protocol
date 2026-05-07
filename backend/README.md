# Backend — Intent Layer Protocol

**Stack:** Node.js **20** (CI version; 18+ often works), TypeScript, **Express** + **ws**, **ethers v6**, **PostgreSQL** (via `pg`), **Vitest** for tests.

**Role in the repo:** Off-chain services for the cross-chain intent protocol. Indexes contract events into Postgres, runs the P2P matching loop and auction orchestrator, exposes a REST + WebSocket API for solvers and the frontend, and ships a reference solver bot.

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](../docs/ARCHITECTURE.md) · [Technology stack](../docs/TECH_STACK.md) · [Stage 3 final review](../docs/STAGE_3_FINAL_REVIEW.md)

---

## Stage 4 status — feature complete (locally)

The on-chain protocol is locked at commit `e47e988` (Stages 0–3 + follow-up security pass). The Stage 4 backend is now feature complete locally with 100/100 tests passing.

| Sub-stage | Module | Status |
|---|---|---|
| 4.0 | DB schema + matcher type alignment | ✅ |
| 4.1 | ABI extraction + shared `Intent` type | ✅ |
| 4.3 | Multi-chain event indexer with resumable cursor | ✅ |
| 4.4 | DB-backed matching loop | ✅ |
| 4.5 | Auction orchestrator (open + finalize) | ✅ |
| 4.6 | Solver REST API + ECDSA proposal verification | ✅ |
| 4.7 | WebSocket server + publishing repository | ✅ |
| 4.8 | Chain submitters + runtime composition | ✅ |
| 4.9 | `.env.example` completions | ✅ |
| Bot | Reference solver bot | ✅ |

The matcher's filter is an **efficiency optimisation, not a security boundary** — destination contract independently re-validates token, chain, and both-sides minimums against authoritative payload data (`docs/STAGE_3_FINAL_REVIEW.md` § R-16). A buggy matcher cannot violate either user's signed `minDestAmount` or `destToken`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | `tsx watch` — API + WS + runtime on port `4000` (override with `API_PORT`) |
| `npm run build` | Emit `dist/` with `tsc` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run lint` | `tsc --noEmit` (typecheck) |
| `npm test` | Vitest |
| `npm run extract-abis` | Re-extract `src/abis/*.json` from `contracts/out/` (run after `forge build`) |

---

## Configuration

Copy [`.env.example`](../.env.example) to `.env` at repo root or set variables in your shell. Required env vars for full operation: `ETH_RPC_URL`, `BASE_RPC_URL`, `*_SETTLER_ADDRESS`, `*_SOLVER_AUCTION_ADDRESS`, `RELAYER_PRIVATE_KEY`. Without `RELAYER_PRIVATE_KEY` the runtime stays in indexer-only mode (no on-chain writes).

---

## Layout

| Path | Role |
|------|------|
| [`src/index.ts`](src/index.ts) | Composition root: pgRepository → publishingRepository → Express + ws → runtime; SIGTERM/SIGINT graceful shutdown |
| [`src/server.ts`](src/server.ts) | Express app factory; routes for `/health`, `/api/intents/*`, `/api/solver/proposals` |
| [`src/runtime.ts`](src/runtime.ts) | Wires indexers + matching loop + auction orchestrator from env config |
| [`src/abis/`](src/abis/) | ABI-only JSON extracted from Foundry artifacts (regenerate via `npm run extract-abis`) |
| [`src/types/intent.ts`](src/types/intent.ts) | Canonical TypeScript shapes mirroring `IIntentSettler.Intent` / `IntentMeta` / `IntentState` |
| [`src/db/pool.ts`](src/db/pool.ts) | `pg.Pool` factory + healthcheck |
| [`src/db/repository.ts`](src/db/repository.ts) | `OrderBookRepository` interface + `pgRepository` implementation. All SQL lives here. |
| [`src/db/publishing-repository.ts`](src/db/publishing-repository.ts) | Decorator that emits `IntentEvent`s on the bus after each successful mutation |
| [`src/services/indexer.ts`](src/services/indexer.ts) | `IntentIndexer` — polls `provider.getLogs` per `(chain, contract)`, advances cursor in transaction |
| [`src/services/indexer-handlers.ts`](src/services/indexer-handlers.ts) | Pure handlers: each contract event → repository call |
| [`src/services/matching.ts`](src/services/matching.ts) | `IntentRecord` type (mirrors on-chain `Intent` struct) + `findOppositeIntent` |
| [`src/services/matching-loop.ts`](src/services/matching-loop.ts) | DB-backed sweep that calls `MatchSubmitter` for each P2P pair |
| [`src/services/auction-orchestrator.ts`](src/services/auction-orchestrator.ts) | Timer that calls `openAuction` after `AUCTION_DELAY` and `executeWinningProposal` after window close |
| [`src/services/chain-submitters.ts`](src/services/chain-submitters.ts) | ethers-based concrete `MatchSubmitter` / `AuctionSubmitter` per chain |
| [`src/services/proposal-verifier.ts`](src/services/proposal-verifier.ts) | ECDSA verification matching `SolverAuction.proposalDigest` |
| [`src/services/event-bus.ts`](src/services/event-bus.ts) | In-process pub/sub keyed by intent hash |
| [`src/services/ws-server.ts`](src/services/ws-server.ts) | WebSocket server: subscribe per hash via `?intentHash=`, broadcasts `IntentEvent` |
| [`src/bot/solver-bot.ts`](src/bot/solver-bot.ts) | Reference solver: poll `/api/intents/auctioning`, sign proposal, submit on-chain |
| [`database/migrations/`](database/migrations/) | Postgres DDL — `001_init.sql`, `002_align_with_contract.sql` |
| [`scripts/extract-abis.mjs`](scripts/extract-abis.mjs) | Foundry artifact → ABI-only JSON extractor |
| [`tests/`](tests/) | Vitest specs (100 tests across 13 files) |

---

## API surface

| Method + path | Notes |
|---|---|
| `GET /health` | Returns `{ok, database}` (probes pg) |
| `GET /api/intents/unmatched?chainId=` | Match-eligible intents (`PENDING` or `AUCTIONING`, not expired) |
| `GET /api/intents/auctioning?chainId=` | Subset filter — only intents currently in the auction window |
| `GET /api/intents/:hash` | Single intent lookup |
| `POST /api/solver/proposals` | Verify `SolverAuction.proposalDigest` ECDSA signature, persist |
| `WS  /ws?intentHash=` | Subscribe to real-time intent events: `Subscribed`, `StateChange`, `ProposalSubmitted`, `WinnerSelected` |

---

## Contributing

Open PRs with tests for any matching, indexer, or API changes; keep `npm run lint` and `npm test` passing per [CONTRIBUTING.md](../CONTRIBUTING.md).
