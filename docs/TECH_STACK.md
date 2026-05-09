# Intent Layer Protocol — Technology Stack

**Audience:** Engineers joining the project · **Version:** 1.1 · **Status:** Reflects Phase 1 feature-complete state (Stages 1–6); update via PR when swapping tools  
**See also:** [README](../README.md) · [Architecture](ARCHITECTURE.md) · [MVP specification](MVP_SPECIFICATION.md) · [Contributing](../CONTRIBUTING.md)

---

## Philosophy

Use **boring, proven tech**. No experimental frameworks or languages. Every component should have:
- Strong community support
- Production use in other protocols
- Clear documentation
- Easy to hire for

---

## Smart Contracts (On-Chain Layer)

### Language
- **Solidity 0.8.26** (pinned in `foundry.toml`)
- Reason: EVM standard; 0.8.26 is the latest stable with optimizer + via-ir off for predictable gas
- Avoid: experimental / nightly versions

### Framework

**Primary: Foundry**
```
why: Fast, written in Rust, great for testing
alt: Hardhat (if Foundry has issues)
```

### Key Dependencies

```solidity
// OpenZeppelin v5.1.0 (audited, standard) — installed via forge install at lib/openzeppelin-contracts
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
- ReentrancyGuard (reentrancy protection)
- SafeERC20 (handles non-standard returns, e.g. USDT)
- EIP712 (typed structured data hashing)
- ECDSA (signature recovery)
- Ownable (ownership patterns)

// LayerZero V2 (cross-chain messaging) — split across two repos:
@layerzerolabs/oapp-evm/=lib/devtools/packages/oapp-evm/                   // OApp base contracts
@layerzerolabs/lz-evm-protocol-v2/=lib/LayerZero-v2/packages/layerzero-v2/evm/protocol/    // ILayerZeroEndpointV2, MessagingFee
@layerzerolabs/lz-evm-messagelib-v2/=lib/LayerZero-v2/packages/layerzero-v2/evm/messagelib/  // Message library types

// Install commands (vendored, not submodules — matches existing forge-std pattern):
//   forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --shallow
//   forge install LayerZero-Labs/devtools --no-git --shallow
//   forge install LayerZero-Labs/LayerZero-v2 --no-git --shallow
```

### Contract Structure

Paths below are relative to the [`contracts/`](../contracts/) Foundry project (`forge build` / `forge test` run from this directory).

```
contracts/
├── foundry.toml                # optimizer 200 runs, Solidity 0.8.26
├── remappings.txt
├── src/
│   ├── ChainPeerRegistry.sol   # chainId → LayerZero EID + route allowlist (deploy per network)
│   ├── IntentSettler.sol       # EIP-712 escrow, CEI, LZ OApp send/receive, auction wiring
│   ├── SolverAuction.sol       # signed proposals, deterministic ranking, settler-gated window
│   ├── interfaces/
│   │   ├── IChainPeerRegistry.sol
│   │   ├── IIntentSettler.sol
│   │   └── ISolverAuction.sol
│   └── libraries/
│       ├── IntentHash.sol      # EIP-712 structured hash
│       ├── SignatureValidator.sol
│       └── SafeTransfer.sol    # USDT-style non-bool ERC-20 returns
├── test/
│   ├── ChainPeerRegistry.t.sol
│   ├── IntentSettler.t.sol
│   ├── IntentSettler.lz.t.sol  # full cross-chain LZ round-trip + security guards
│   ├── IntentSettler.solver.t.sol
│   ├── IntentSettler.invariant.t.sol  # fuzz tests
│   ├── Integration.t.sol
│   ├── IntentHash.t.sol
│   ├── SolverAuction.t.sol
│   └── mocks/
│       ├── MockLzEndpoint.sol  # queue + deliverNext / dropNext / deliverInbound
│       ├── MockERC20.sol
│       └── MockUSDT.sol        # non-bool return transfer
└── lib/                        # vendored via forge install --no-git --shallow
    ├── forge-std/
    ├── openzeppelin-contracts/ # v5.1.0
    ├── LayerZero-v2/
    └── devtools/               # @layerzerolabs/oapp-evm
```

**Test count:** 94 Foundry tests pass (`forge test`) + 3 fuzz/invariant suites.  
**Gas report:** see `docs/GAS_BENCHMARKS.md`.

### Tooling

```bash
# Testing
cd contracts
forge test                        # 94 tests (all suites)
forge test --gas-report           # per-function gas table (see GAS_BENCHMARKS.md)
forge test --match-test "Fuzz"    # fuzz / invariant suites only

# Security
slither .                         # static analysis (clean as of Stage 3)

# Deployment (Stage 8)
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast
forge verify-contract <addr> IntentSettler --etherscan-api-key $KEY

# Local node
anvil --chain-id 31337 --port 8545
```

---

## Backend (Off-Chain Services)

### Language
- **TypeScript (Node.js 20+)** — align with repository CI (`.github/workflows/ci.yml`)
- Reason: Type-safe, large crypto ecosystem, easy to hire
- Runtime: Node.js 20 LTS (current CI target)

### Service Architecture

```
backend/
├── src/
│   ├── index.ts                    # entry: boots all services
│   ├── runtime.ts                  # env config + RPC providers
│   ├── server.ts                   # Express API + CORS + WS upgrade
│   ├── db/
│   │   ├── pool.ts                 # pg Pool singleton
│   │   ├── repository.ts           # OrderBookRepository interface + pgRepository
│   │   └── publishing-repository.ts # wraps repo; publishes events to EventBus
│   ├── services/
│   │   ├── indexer.ts              # IntentIndexer: resumable getLogs polling
│   │   ├── indexer-handlers.ts     # event → repository mapper (settler + auction)
│   │   ├── matching.ts             # findOppositeIntent algorithm
│   │   ├── matching-loop.ts        # MatchingLoop: ticks every 5s, greedy P2P scan
│   │   ├── auction-orchestrator.ts # AuctionOrchestrator: openAuction + finalize
│   │   ├── chain-submitters.ts     # buildChainSubmitters: ethers calls → contracts
│   │   ├── proposal-verifier.ts    # ECDSA proposalDigest verification
│   │   ├── event-bus.ts            # in-process EventEmitter for WS fan-out
│   │   └── ws-server.ts            # WS server: per-intent subscriptions
│   ├── bot/
│   │   └── solver-bot.ts           # reference solver: polls auctioning, bids, submits
│   ├── abis/                       # extracted by scripts/extract-abis.mjs
│   └── types/
│       └── intent.ts               # IntentRecord, IntentState, matching types
├── tests/
│   ├── *.test.ts                   # 109 unit tests (vitest)
│   └── e2e/
│       ├── full-roundtrip.test.ts  # P2P across two Anvils (full stack)
│       ├── cancellation.test.ts    # submit → cancel → indexer observes
│       ├── pg-smoke.test.ts        # migrations parse + CHECK constraints
│       └── helpers/
│           ├── anvil.ts            # spawn/stop Anvil; leak-safe on timeout
│           ├── deploy-stack.ts     # deploy contracts via ethers ContractFactory
│           ├── lz-relayer.ts       # cross-Anvil LZ message ferry
│           ├── in-memory-repo.ts   # in-memory OrderBookRepository for E2E
│           └── artifacts.ts        # reads Foundry out/ artifacts
├── scripts/
│   ├── extract-abis.mjs            # copies ABIs from contracts/out/
│   └── local-stack.ts              # npm run local-stack (Anvil + Postgres + all services)
├── db/
│   └── migrations/                 # SQL migrations (applied by local-stack)
├── vitest.config.ts
└── vitest.e2e.config.ts
```

### Key Frameworks & Libraries

**HTTP Server:**
```typescript
// Express (mature, simple)
import express from 'express';
const app = express();
app.get('/api/intents', handler);
```

**Blockchain Interaction:**
```typescript
// ethers.js v6 (industry standard)
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(address, ABI, provider);
```

**Database:**
```typescript
// pg (native PostgreSQL driver)
import { Pool } from 'pg';
const pool = new Pool();
const result = await pool.query('SELECT * FROM intents');
```

**Event Processing:**
```typescript
// ethers.js event listeners
contract.on('IntentSubmitted', (intentHash, user) => {
    console.log('New intent:', intentHash);
});
```

**Message Queue (for high-volume):**
```typescript
// Redis (optional, Phase 2)
import redis from 'redis';
const client = redis.createClient();
await client.publish('intents', intentData);
```

**Testing:**
```typescript
// Jest + Vitest
import { describe, it, expect } from 'vitest';
describe('Matching Engine', () => {
    it('should find opposite intents', () => {
        expect(findMatch(intent1)).toBe(intent2);
    });
});
```

### Backend Dependencies

```json
{
  "dependencies": {
    "express": "^4.21.1",
    "ethers": "^6.13.4",
    "pg": "^8.13.1",
    "ws": "^8.20.0",
    "cors": "^2.8.6",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "vitest": "^2.1.3",
    "tsx": "^4.19.1",
    "pg-mem": "^3.0.14",
    "supertest": "^7.2.2",
    "typescript": "^5.6.3",
    "@types/node": "^20",
    "@types/express": "^4.17.21",
    "@types/pg": "^8.11.10",
    "@types/ws": "^8.18.1"
  }
}
```

Note: **No Redis.** Event fan-out uses an in-process `EventBus` (EventEmitter). Redis is a Phase 2 addition for horizontal scaling.

### Test commands

```bash
cd backend
npm test              # 109 unit tests
npm run test:e2e      # 4 E2E tests (spawns Anvil, deploys contracts)
npm run local-stack   # full dev stack (Anvil + Postgres + all services)
```

### Configuration

```bash
# .env
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
DB_HOST=localhost
DB_PORT=5432
DB_NAME=intent_protocol
DB_USER=postgres
DB_PASSWORD=...
LAYERZERO_ETH_ADDRESS=0x...
LAYERZERO_BASE_ADDRESS=0x...
```

---

## Frontend (Web UI)

### Language
- **TypeScript 5 + React 19.2**
- React 19 strict rules (purity / set-state-in-effect / refs / static-components) enforced.

### Framework
- **Next.js 16.2** (App Router, Turbopack dev server)
  - Server Components + dynamic params (`Promise<{id: string}>` for route segments — Next 16 async params)
  - Metadata API (title template, OpenGraph, Twitter, viewport themeColor)

### Styling + UI

- **Tailwind CSS v4.2** (CSS-first config in `globals.css` — no `tailwind.config.js`)
- **shadcn/ui v4** on top of **Radix UI** primitives — Dialog, Select, Input, Button, Tabs, Skeleton, Card, Badge, Separator, Sheet, Tooltip, Table
- **Framer Motion v12** — quiet motion only; state-driven cyan-glow on RoutePreview lifecycle steps
- **Sonner v2** — toast notifications
- Design: glass-card (`backdrop-blur-2xl`), deep-navy + electric-cyan oklch palette, asymmetric layouts

### Installed Packages (exact)

```json
{
  "next": "^16.2.6",
  "react": "^19.2.0",
  "viem": "^2.48.8",
  "wagmi": "^3.6.9",
  "@tanstack/react-query": "^5.100.9",
  "zustand": "^5.0.13",
  "tailwindcss": "^4.2.4",
  "framer-motion": "^12.38.0",
  "shadcn": "^4.7.0",
  "sonner": "^2.0.7",
  "@coinbase/wallet-sdk": "^4.3.7",
  "@metamask/connect-evm": "~1.0.0",
  "@walletconnect/ethereum-provider": "^2.23.9",
  "@safe-global/safe-apps-sdk": "^9.1.0",
  "lucide-react": "^1.14.0"
}
```

Note: **No recharts.** The stats strip uses static mock data; a chart library is a Phase 2 addition.

### Key Libraries

**Web3 Integration:**
```typescript
// wagmi + viem (modern, type-safe)
import { useAccount, useContract } from 'wagmi';
import { parseEther } from 'viem';

const { address } = useAccount();
const amount = parseEther('1.0');
```

**State Management:**
```typescript
// TanStack Query (React Query)
// For server state (API data, blockchain data)
import { useQuery } from '@tanstack/react-query';

const { data: intents } = useQuery(['intents'], fetchIntents);
```

```typescript
// Zustand (client state)
// For UI state (modal open, selected chain, etc)
import { create } from 'zustand';

const useStore = create((set) => ({
    selectedChain: 'ethereum',
    setSelectedChain: (chain) => set({ selectedChain: chain })
}));
```

**UI & motion:**
```typescript
// Tailwind CSS + shadcn/ui (Radix primitives) + Framer Motion
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function Cta() {
  return (
    <motion.div whileHover={{ scale: 1.02 }}>
      <Button variant="default">Create intent</Button>
    </motion.div>
  );
}
```

**Charts & Analytics:**
```typescript
// Recharts (volume, match rate visualization)
import { LineChart, Line } from 'recharts';

export function VolumeChart() {
    return <LineChart data={data}><Line .../></LineChart>;
}
```

**Real-time Updates:**
```typescript
// WebSocket (viem has native support)
const { on, off } = publicClient.watchContractEvent({
    address: IntentSettler,
    eventName: 'IntentMatched',
    onLogs: (logs) => setStatus('matched')
});
```

### Frontend Structure

```
frontend/
├── app/
│   ├── layout.tsx              # root layout, AppShell, ThemeProvider
│   ├── providers.tsx           # wagmi + TanStack Query + Sonner
│   ├── page.tsx                # landing: HeroVisual, StatsStrip, HowItWorks, ActivityTicker
│   ├── swap/
│   │   └── page.tsx            # swap card: SwapForm, SwapPreview, SubmitIntentButton
│   ├── intent/
│   │   └── [id]/
│   │       ├── page.tsx        # server component; passes params to client
│   │       └── status-client.tsx  # real-time WS, IntentStatusTimeline, IntentActions, RoutePreview
│   └── history/
│       └── page.tsx            # paginated intent history table
├── components/
│   ├── AppShell.tsx            # header / nav / footer
│   ├── SwapForm.tsx            # amount inputs, slippage, TokenPickerDialog trigger
│   ├── SwapPreview.tsx         # indicative rate + fee summary
│   ├── SwapSettings.tsx        # deadline + refund-to popover
│   ├── SubmitIntentButton.tsx  # chained approve → submitIntent wagmi flow
│   ├── TokenPickerDialog.tsx   # combined chain + token picker (mobile-aware)
│   ├── TokenChainChip.tsx      # token + chain pill display
│   ├── RoutePreview.tsx        # lifecycle steps with LZ animation + tx-hash chips
│   ├── IntentStatusTimeline.tsx
│   ├── IntentActions.tsx       # cancel / refundIfLzTimeout buttons
│   ├── WalletButton.tsx        # connect / address display
│   ├── WalletPickerDialog.tsx  # multi-wallet picker (MetaMask, Coinbase, WC, Safe)
│   ├── NetworkBanner.tsx       # wrong-network warning
│   ├── HeroVisual.tsx          # landing hero illustration
│   ├── StatsStrip.tsx          # protocol stats bar
│   ├── HowItWorks.tsx          # landing explainer
│   ├── ActivityTicker.tsx      # live-activity ticker on landing
│   ├── Logo.tsx
│   ├── icons/
│   │   ├── ChainIcon.tsx
│   │   └── TokenIcon.tsx
│   └── ui/                     # shadcn/ui primitives
├── scripts/
│   └── extract-abis.mjs        # copies ABIs from contracts/out/
└── styles / globals.css        # Tailwind v4 CSS-first config + oklch palette
```

---

## Database (Order Book)

### Technology
- **PostgreSQL 15+**
- Reason: ACID transactions, JSON support, proven reliability

### Schema (actual — `backend/db/migrations/`)

Key design choices over the spec baseline:
- All amounts stored as `TEXT` (not NUMERIC) to avoid uint256 precision loss
- `refund_to` column added for ERC-7683 alignment
- `nonce` column for replay protection
- Packed `submitted_at_block_ts` for auction delay calculation
- Per-state tx-hash columns (`submit_tx_hash`, `match_tx_hash`, `settle_tx_hash`, etc.) so the frontend can link to block explorers
- `solver_fee_bps` constrained to `SMALLINT` (matches uint16 on-chain)
- `indexer_cursors (chain_id, contract_address)` composite PK prevents duplicate cursors — advancing inside the same Postgres transaction as event writes makes crash-recovery safe

The schema is verified by the pg-mem smoke test (`backend/tests/e2e/pg-smoke.test.ts`) on every CI run.

---

## Infrastructure & Deployment

### Local Development

```bash
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  
  anvil:
    image: ghcr.io/foundry-rs/foundry:latest
    ports:
      - "8545:8545"
    command: anvil --host 0.0.0.0
```

```bash
# Start everything
docker-compose up -d

# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### Testnet Deployment (Sepolia)

```bash
# Deploy to Sepolia
forge script Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast

# Verify on Etherscan
forge verify-contract <address> IntentSettler --etherscan-api-key $KEY
```

### Mainnet Deployment

**Infrastructure:**
- RPC Nodes: Alchemy (redundancy)
- Hosting: AWS EC2 (backend)
- Database: AWS RDS (PostgreSQL)
- Frontend: Vercel (Next.js)
- Monitoring: DataDog

**Deployment Steps:**
1. Deploy contracts to Ethereum mainnet
2. Deploy contracts to Base mainnet
3. Verify contracts on Etherscan
4. Deploy backend to AWS
5. Deploy frontend to Vercel
6. Configure monitoring/alerts
7. Run end-to-end tests against mainnet

---

## Development Workflow

### Version Control

```bash
git clone https://github.com/sp0oby/intent-layer-protocol.git
cd intent-layer-protocol

# Create feature branch
git checkout -b feature/intent-matching

# Commit with conventional commits
git commit -m "feat: add intent matching engine"

# Open PR
git push origin feature/intent-matching
```

### Testing Strategy

```bash
# Smart contracts
cd contracts && forge test

# Backend
cd backend && npm test

# Frontend
cd frontend && npm test

# Integration
npm run test:integration  # All layers together
```

### Code Quality

```bash
# Linting
solhint contracts/**  # Solidity
npm run lint          # TypeScript/JavaScript

# Formatting
prettier --write .    # Code formatting

# Security
slither .             # Smart contract security
npm run audit         # Dependency audit
```

---

## Monitoring & Observability

### Logs
```typescript
import pino from 'pino';
const logger = pino();
logger.info({ intentHash }, 'Intent submitted');
```

### Metrics
```typescript
// Track key metrics
- Intents submitted per hour
- Matching latency (p50, p99)
- Settlement success rate
- Solver participation
```

### Alerts
```
- Message delivery failure (LayerZero)
- Matching latency > 10 seconds
- Settlement failure
- Unusual gas usage
```

---

## Document control

| | |
|:---|:---|
| **Version** | 1.1 |
| **Last updated** | 2026-05-09 |
| **Status** | Reflects Phase 1 feature-complete state (Stages 1–6 done). Frontend versions updated to reflect actual installed packages. Backend structure updated to reflect actual source layout. Redis removed (Phase 2). |