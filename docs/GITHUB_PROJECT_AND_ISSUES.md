# GitHub — Project board & issue templates

**Audience:** Maintainers · **Purpose:** Operational guide for backlog hygiene (not protocol design)  
**See also:** [README](../README.md) · [Contributing](../CONTRIBUTING.md)

**Automated option:** from the repo root, run `./scripts/bootstrap-github-project-and-issues.sh` (after `gh auth login` and `gh auth refresh -s project`) to create the project, link it to this repository, and open the issues below.

### Script details and troubleshooting

After authenticating:

```bash
./scripts/bootstrap-github-project-and-issues.sh
```

This creates a GitHub **Project** titled `Intent Layer MVP` (override with `GITHUB_PROJECT_TITLE`), links it to this repo, and opens labeled **issues** for Week 1–4 work. Rename board columns in the GitHub UI if you want `Backlog / In progress / Review / Done`.

**If linking failed** with `different owner from '@me'`, `gh project link` expects `--repo intent-layer-protocol` (short name), not `owner/repo`. Fix: pull the latest script, or run `gh project link 1 --owner sp0oby --repo intent-layer-protocol`. To reuse project **1** and run the rest (labels + issues): `EXISTING_PROJECT_NUMBER=1 ./scripts/bootstrap-github-project-and-issues.sh`. Link only: add `SKIP_ISSUES=1`.

---

This guide also supports manual setup via the GitHub web UI or one-off `gh issue create` commands.

---

## 1. Create a project (classic or Projects v2)

**Columns:** `Backlog`, `In progress`, `Review`, `Done`

- **GitHub UI:** Repository → **Projects** → **New project** → Board template → rename columns as above.

## 2. Epics (parent tracking)

Create these as Issues and label `epic` (create label if needed). Link child issues to them in descriptions or Project parent field.

| Epic | Description |
|------|-------------|
| E1 — Contracts skeleton | Foundry layout, `IntentSettler`, `SolverAuction`, libs, test stubs |
| E2 — Backend skeleton | Indexer, matching stub, solver API, Postgres schema |
| E3 — Frontend skeleton | Next.js, Swap + Intent status, wallet, dummy API |
| E4 — Platform | CI, docker-compose, `.env.example` |

## 3. Week 1 — Issues (copy title + body)

### W1-01 — Foundry workspace and contract stubs

**Body:**

```markdown
## Scope
- Add `foundry.toml`, remappings, `.gitignore` for `out/`, `cache/`
- `src/IntentSettler.sol` — struct + `submitIntent` stub + `IntentSubmitted` event + escrow placeholder
- `src/SolverAuction.sol` — auction skeleton
- `src/interfaces/IIntentSettler.sol` (if split)
- `src/libraries/IntentHash.sol`, `SignatureValidator.sol`, `SafeTransfer.sol` (minimal stubs)

## Acceptance
- `forge build` succeeds
- `forge test` runs (placeholders may use `assertTrue(true)`)

Labels: contracts, week-1
Milestone: Week 1
```

### W1-02 — Foundry test placeholders

**Body:**

```markdown
## Scope
- `test/IntentSettler.t.sol`, `test/SolverAuction.t.sol`, `test/Integration.t.sol` (shell only)

## Acceptance
- Tests compile; can be expanded later

Labels: contracts, week-1
```

### W1-03 — Backend package and indexer stub

**Body:**

```markdown
## Scope
- `backend/` TypeScript, ethers v6, Vitest
- Indexer module: subscribe/listen placeholder for `IntentSubmitted` (config via env)

## Acceptance
- `npm test` passes stub tests
- `npm run build` if applicable

Labels: backend, week-1
```

### W1-04 — Matching engine stub + tests

**Body:**

```markdown
## Scope
- In-memory matching API matching opposite intents (per MVP spec pseudocode as stub)
- Vitest unit tests for trivial cases

Labels: backend, week-1
```

### W1-05 — Solver REST API + Postgres schema

**Body:**

```markdown
## Scope
- Express (or chosen HTTP server): list unmatched intents, accept proposal stubs
- `database/migrations/` or `schema.sql` for intents table (align with TECH_STACK)

Labels: backend, week-1
```

### W1-06 — Frontend app shell

**Body:**

```markdown
## Scope
- Next.js App Router, Tailwind, shadcn/ui, Framer Motion, wagmi + viem + TanStack Query + Zustand
- Pages: `/` (landing), `/swap`, `/intent/[id]` or `/intent-status`
- Wallet connect (wagmi)

Labels: frontend, week-1
```

### W1-07 — Dummy API for local dev

**Body:**

```markdown
## Scope
- Next.js Route Handlers or backend `/api` stub returning mock intents for UI

Labels: frontend, backend, week-1
```

### W1-08 — Docker compose + env template

**Body:**

```markdown
## Scope
- Root `docker-compose.yml`: Postgres, Redis, Anvil
- `.env.example` documenting vars (no secrets)

Labels: platform, week-1
```

### W1-09 — CI workflow

**Body:**

```markdown
## Scope
- GitHub Actions: `forge test`, backend lint/test, frontend build on PRs

Labels: platform, week-1
```

## 4. Weeks 2–4 — High-level Issues

### W2-01 — LayerZero OApp wiring (stub)

Placeholder integration per ARCHITECTURE; message encode/decode stubs.

### W2-02 — Indexer → Postgres persistence

Wire listener to insert/update `intents` rows.

### W2-03 — Contract deployment scripts

`forge script` local + testnet placeholders.

### W3-01 — Solver auction flow (on-chain + API)

Expand `SolverAuction` and API per MVP_SPECIFICATION.

### W3-02 — Reference solver bot (optional stub)

CLI or minimal script posting proposals.

### W4-01 — E2E smoke: submit → index → UI

Documented demo path on local Anvil.

### W4-02 — Gas snapshots + coverage baseline

`forge snapshot`, document targets.

## 5. Bulk create with GitHub CLI (optional)

After `gh auth login`:

```bash
cd /path/to/intent-layer-protocol
gh issue create --title "W1-01 — Foundry workspace and contract stubs" --body-file docs/issues/w1-01.md
```

Split bodies into `docs/issues/` if preferred.

---

## Document control

| | |
|:---|:---|
| **Last updated** | 2026-05-06 |
| **Maintainer** | Project owners — refresh issue templates when roadmap shifts |
