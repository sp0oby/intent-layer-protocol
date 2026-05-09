# Frontend — Intent Layer Protocol

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui (base-ui primitives) · Framer Motion · **wagmi v3** + **viem** · **TanStack Query** · **Zustand**.

**Role in the repo:** Web client for creating and tracking cross-chain intents. Stage 5 is feature-complete: real `submitIntent` flow against deployed contracts, indicative-rate auto-fill, multi-wallet picker, state-driven status page with live solver-bid feed and per-state tx-hash explorer chips, paginated history, mobile-responsive at 375px.

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Technology stack](../docs/TECH_STACK.md)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server (default [http://localhost:3000](http://localhost:3000)) |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint (Next.js + TypeScript) |
| `npm test` | Vitest unit suite (40 tests across 5 files) |

---

## Configuration

Public env vars are prefixed with `NEXT_PUBLIC_`. Start from the repo root [`.env.example`](../.env.example) — **never commit** RPC keys or secrets.

For local-Anvil testing, the backend's `npm run local-stack` script auto-writes `frontend/.env.local` with freshly-deployed contract addresses on every run. Restart `npm run dev` after a local-stack restart for Next to re-read.

Key env vars:
- `NEXT_PUBLIC_API_BASE_URL` — backend REST + WS root (default `http://localhost:4000`)
- `NEXT_PUBLIC_LOCAL_ETH_SETTLER_ADDRESS` / `NEXT_PUBLIC_LOCAL_BASE_SETTLER_ADDRESS` — local Anvil deployments
- `NEXT_PUBLIC_LOCAL_ETH_SOLVER_AUCTION_ADDRESS` / `NEXT_PUBLIC_LOCAL_BASE_SOLVER_AUCTION_ADDRESS`
- `NEXT_PUBLIC_LOCAL_USDC_ADDRESS` — mock USDC on the Anvil pair

---

## Route map

| Route | Purpose |
|-------|---------|
| [`app/page.tsx`](app/page.tsx) | Landing — hero with embedded swap preview, live activity ticker, "How it works" |
| [`app/swap/page.tsx`](app/swap/page.tsx) | Across-style swap card: combined token+chain picker, indicative-rate auto-fill, slippage selector, settings popover (deadline + refund-to override), real `submitIntent` write |
| [`app/intent/[id]/page.tsx`](app/intent/[id]/page.tsx) | Status page: hero with state pill, state-driven `RoutePreview`, live solver-bid feed, tx-hash explorer chips, cancel/refund actions |
| [`app/history/page.tsx`](app/history/page.tsx) | Wallet-gated paginated history with chain-overlay token icons + state pills |

---

## Architecture

| Concern | Location | Notes |
|---------|----------|-------|
| Wallet | `components/WalletButton.tsx` + `WalletPickerDialog.tsx` | wagmi v3 connectors: MetaMask SDK / Coinbase Wallet SDK / WalletConnect (env-gated) / Safe / Injected |
| API client | `lib/api.ts` | Thin fetch wrapper; `NEXT_PUBLIC_API_BASE_URL` |
| Data fetching | `hooks/useIntents.ts` + `useIntentStatus.ts` | TanStack Query for REST; native WebSocket for live state changes |
| Contracts | `lib/contracts.ts` | Per-chain address map; ABIs vendored via `npm run extract-abis` from backend |
| Tokens | `lib/tokens.ts` | Phase 1 token registry per chain |
| Rates (dev) | `lib/rates.ts` | **Hardcoded indicative rates — replace before mainnet** with Chainlink or CoinGecko fetch |
| Picker | `components/TokenPickerDialog.tsx` + `TokenChainChip.tsx` | Across-style two-column dialog (chain + token); single-column on mobile |
| Status page route preview | `components/RoutePreview.tsx` | State-driven `Match → Settlement → Refund` highlighting via `stateToActiveStep(intent.state)` |

---

## Contributing

Follow [CONTRIBUTING.md](../CONTRIBUTING.md): keep `npm run build` + `npm test` green, prefer small PRs, extend TanStack Query hooks rather than fetching ad hoc.
