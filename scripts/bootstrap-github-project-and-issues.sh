#!/usr/bin/env bash
# Create a GitHub Project (board) and backlog issues for Intent Protocol Layer.
#
# Prerequisites:
#   gh auth login -h github.com
#   gh auth refresh -s project -h github.com
#
# Usage (from repo root):
#   ./scripts/bootstrap-github-project-and-issues.sh
#
# Env overrides:
#   GITHUB_REPOSITORY=owner/repo     (default: sp0oby/intent-layer-protocol)
#   GITHUB_PROJECT_TITLE="..."       (default: Intent Layer MVP)
#
# If the project already exists (e.g. link failed on first run):
#   EXISTING_PROJECT_NUMBER=1 ./scripts/bootstrap-github-project-and-issues.sh
#
# Link only (no new issues/labels):
#   EXISTING_PROJECT_NUMBER=1 SKIP_ISSUES=1 ./scripts/bootstrap-github-project-and-issues.sh

set -euo pipefail

REPO_FULL="${GITHUB_REPOSITORY:-sp0oby/intent-layer-protocol}"
PROJECT_TITLE="${GITHUB_PROJECT_TITLE:-Intent Layer MVP}"

if [[ "${REPO_FULL}" != */* ]]; then
  echo "GITHUB_REPOSITORY must be owner/repo (got: ${REPO_FULL})" >&2
  exit 1
fi

OWNER="${REPO_FULL%%/*}"
REPO_NAME="${REPO_FULL#*/}"

gh auth status

if [[ -n "${EXISTING_PROJECT_NUMBER:-}" ]]; then
  NUM="${EXISTING_PROJECT_NUMBER}"
  echo "Using existing project number: ${NUM} (owner: ${OWNER})"
else
  echo "Creating project: ${PROJECT_TITLE} (owner: ${OWNER})"
  JSON="$(gh project create --owner "${OWNER}" --title "${PROJECT_TITLE}" --format json)"
  NUM="$(echo "${JSON}" | jq -r '.number')"
  echo "Project number: ${NUM} (open: gh project view ${NUM} --owner ${OWNER} --web)"
fi

echo "Linking project ${NUM} to repository ${REPO_FULL}"
# gh project link expects --repo as the short name only (not owner/repo).
gh project link "${NUM}" --owner "${OWNER}" --repo "${REPO_NAME}"

issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  gh issue create -R "${REPO_FULL}" -t "${title}" -b "${body}" -l "${labels}" -p "${PROJECT_TITLE}"
}

if [[ -n "${SKIP_ISSUES:-}" ]]; then
  echo "SKIP_ISSUES set; skipping labels and issue creation."
else
  for label in epic contracts backend frontend platform week-1 week-2 week-3 week-4; do
    gh label create "${label}" -R "${REPO_FULL}" --color "c2e0c6" 2>/dev/null || true
  done

  # --- Epics ---
  issue "Epic: E1 Contracts skeleton" "Parent issue for Foundry layout, IntentSettler, SolverAuction, libraries, and tests. Close when substories are done." "epic,contracts"
  issue "Epic: E2 Backend skeleton" "Parent issue for indexer, matching engine, solver API, and Postgres schema." "epic,backend"
  issue "Epic: E3 Frontend skeleton" "Parent issue for Next.js UI, wallet flow, swap + intent status, API integration." "epic,frontend"
  issue "Epic: E4 Platform" "Parent issue for CI, docker-compose, env templates, developer experience." "epic,platform"

  # --- Week 1 ---
  issue "W1-01: Foundry workspace and contract stubs" $'## Scope\n- foundry.toml, remappings, ignore build artifacts\n- IntentSettler: struct, submitIntent stub, IntentSubmitted event, escrow TODO\n- SolverAuction skeleton\n- interfaces/ + libraries/ (IntentHash, SignatureValidator, SafeTransfer)\n\n## Acceptance\n- forge build\n- forge test' "contracts,week-1"

  issue "W1-02: Foundry test placeholders" $'## Scope\n- Unit + integration test shells\n\n## Acceptance\n- forge test passes' "contracts,week-1"

  issue "W1-03: Backend indexer stub" $'## Scope\n- Wire ethers listener placeholder for IntentSubmitted\n- Env-based RPC + contract address\n\n## Acceptance\n- npm test, npm run lint' "backend,week-1"

  issue "W1-04: Matching engine + tests" $'## Scope\n- In-memory opposite-intent matcher per MVP pseudocode\n- Vitest coverage\n\n## Acceptance\n- npm test' "backend,week-1"

  issue "W1-05: Solver API + Postgres schema" $'## Scope\n- REST: list unmatched intents, accept proposal stub\n- Apply database/migrations\n\n## Acceptance\n- API starts against docker Postgres' "backend,week-1"

  issue "W1-06: Frontend app shell" $'## Scope\n- Next.js routes: landing, swap, intent status\n- wagmi wallet connect, TanStack Query, Zustand\n\n## Acceptance\n- npm run build' "frontend,week-1"

  issue "W1-07: Dummy API for local dev" $'## Scope\n- Mock or proxy API for UI until backend is wired\n\n## Acceptance\n- UI loads data from /api/intents or backend' "frontend,backend,week-1"

  issue "W1-08: Docker compose + env template" $'## Scope\n- Root docker-compose for Postgres, Redis, Anvil\n- .env.example kept current\n\n## Acceptance\n- docker compose up -d works' "platform,week-1"

  issue "W1-09: CI workflow" $'## Scope\n- PR workflow: forge test, backend lint/test, frontend lint/build\n\n## Acceptance\n- CI green on main' "platform,week-1"

  # --- Weeks 2-4 (high level) ---
  issue "W2-01: LayerZero OApp wiring (stub)" "Add message encode/decode stubs and interface alignment with ARCHITECTURE.md." "contracts,week-2"
  issue "W2-02: Indexer to Postgres persistence" "Persist indexed intents; idempotent upserts." "backend,week-2"
  issue "W2-03: Contract deployment scripts" "forge script for local + testnet placeholders." "contracts,week-2"
  issue "W3-01: Solver auction flow" "Expand SolverAuction + API per MVP_SPECIFICATION.md." "contracts,backend,week-3"
  issue "W3-02: Reference solver bot (optional)" "Minimal bot or CLI posting proposals to API." "backend,week-3"
  issue "W4-01: E2E smoke: submit to index to UI" "Documented path: anvil + API + UI." "platform,week-4"
  issue "W4-02: Gas snapshots + coverage baseline" "forge snapshot + document targets." "contracts,week-4"
fi

echo "Done. Configure board columns (Backlog / In progress / Review / Done) in the GitHub Projects UI if needed."
