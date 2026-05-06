# Intent Layer Protocol — Technology Stack

**Audience:** Engineers joining the project · **Version:** 1.0 · **Status:** Baseline choices for Phase 1; adjust via ADR or PR when swapping tools  
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
- **Solidity 0.8.20+**
- Reason: EVM standard, security improvements in 0.8
- Avoid: experimental versions

### Framework

**Primary: Foundry**
```
why: Fast, written in Rust, great for testing
alt: Hardhat (if Foundry has issues)
```

### Key Dependencies

```solidity
// OpenZeppelin (audited, standard)
@openzeppelin/contracts ^5.0.0
- ERC20, ERC721 (token standards)
- AccessControl (role-based permissions)
- Ownable (ownership patterns)
- ReentrancyGuard (reentrancy protection)
- ECDSA (signature verification)

// LayerZero V2 (cross-chain messaging)
@layerzerolabs/oapp-evm ^2.0.0
- OApp (base class for cross-chain apps)
- Endpoint (LayerZero endpoint)
- Send options (messaging config)
```

### Contract Structure

Paths below are relative to the [`contracts/`](../contracts/) Foundry project (`forge build` / `forge test` run from this directory).

```
contracts/
├── foundry.toml
├── remappings.txt
├── src/
│   ├── ChainPeerRegistry.sol   # chainId → LayerZero EID + route allowlist (deploy per network)
│   ├── IntentSettler.sol       # settlement skeleton; constructor takes optional registry address
│   ├── SolverAuction.sol
│   ├── interfaces/
│   │   ├── IChainPeerRegistry.sol
│   │   └── IIntentSettler.sol
│   └── libraries/
│       ├── IntentHash.sol
│       ├── SignatureValidator.sol
│       └── SafeTransfer.sol
├── test/
│   ├── ChainPeerRegistry.t.sol
│   ├── IntentSettler.t.sol
│   ├── Integration.t.sol
│   └── SolverAuction.t.sol
└── lib/
    └── forge-std/              # vendored — see contracts/README.md
```

Token interfaces (e.g. `IERC20`) and LayerZero receiver-facing types typically come from **dependencies** (`forge install`) or `@layerzerolabs/*` when integrated — they are not stubs in `src/interfaces/` yet. Add a dedicated **`test/CrossChain.t.sol`** (or similar) when the LayerZero harness lands.

### Tooling

```bash
# Testing
forge test                    # Run Foundry tests
forge coverage               # Code coverage
forge gas-snapshot          # Gas benchmarking

# Linting
solhint contracts/**         # Linting
slither .                   # Security analysis

# Deployment
forge script Deploy.s.sol    # Deployment script

# Local node
Foundry anvil               # Local blockchain
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
├── services/
│   ├── indexer/          (monitors blockchain events)
│   ├── matching-engine/  (finds matching intents)
│   ├── auction-oracle/   (solver auction coordination)
│   └── api/              (REST API for solvers + frontend)
├── database/
│   └── schema.sql        (PostgreSQL schema)
├── tests/
│   ├── indexer.test.ts
│   ├── matching.test.ts
│   └── auction.test.ts
└── docker-compose.yml    (local dev environment)
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
    "express": "^4.18.0",
    "ethers": "^6.0.0",
    "pg": "^8.10.0",
    "redis": "^4.6.0",
    "dotenv": "^16.0.0",
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^0.34.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  }
}
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
REDIS_URL=redis://localhost:6379
LAYERZERO_ETH_ADDRESS=0x...
LAYERZERO_BASE_ADDRESS=0x...
```

---

## Frontend (Web UI)

### Language
- **TypeScript + React 18+**
- Reason: Type-safe, massive ecosystem, best for crypto UX

### Framework
- **Next.js 14** (App Router)
  - Built-in API routes
  - Server-side rendering
  - Static generation
  - Excellent DX

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
│   ├── layout.tsx          (root layout)
│   ├── page.tsx            (landing page)
│   ├── swap/
│   │   └── page.tsx        (swap interface)
│   ├── intent/
│   │   └── [id]/page.tsx   (intent status)
│   ├── history/
│   │   └── page.tsx        (transaction history)
│   └── api/
│       └── intents/route.ts  (dummy or proxy API for local dev)
├── components/
│   ├── Navbar.tsx
│   ├── SwapForm.tsx
│   ├── IntentStatus.tsx
│   └── WalletConnect.tsx
├── hooks/
│   ├── useIntent.ts
│   ├── useMatchStatus.ts
│   └── useSettlement.ts
├── utils/
│   ├── chains.ts
│   ├── tokens.ts
│   └── formatting.ts
└── styles/
    └── globals.css
```

### Frontend Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "wagmi": "^2.0.0",
    "viem": "^2.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "framer-motion": "^11.0.0",
    "recharts": "^2.10.0"
  }
}
```

---

## Database (Order Book)

### Technology
- **PostgreSQL 15+**
- Reason: ACID transactions, JSON support, proven reliability

### Schema

```sql
-- Intents table
CREATE TABLE intents (
    id BIGSERIAL PRIMARY KEY,
    intent_hash BYTEA UNIQUE NOT NULL,
    user_address BYTEA NOT NULL,
    source_chain_id INT NOT NULL,
    source_token BYTEA NOT NULL,
    source_amount NUMERIC NOT NULL,
    dest_chain_id INT NOT NULL,
    dest_token BYTEA NOT NULL,
    min_dest_amount NUMERIC NOT NULL,
    deadline BIGINT NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    settled_at TIMESTAMP,
    INDEX idx_state (state),
    INDEX idx_chains (source_chain_id, dest_chain_id),
    INDEX idx_deadline (deadline),
    INDEX idx_user (user_address)
);

-- Matches table
CREATE TABLE matches (
    id BIGSERIAL PRIMARY KEY,
    intent_hash_a BYTEA NOT NULL,
    intent_hash_b BYTEA NOT NULL,
    matched_at TIMESTAMP DEFAULT NOW(),
    settled_at TIMESTAMP,
    FOREIGN KEY (intent_hash_a) REFERENCES intents(intent_hash),
    FOREIGN KEY (intent_hash_b) REFERENCES intents(intent_hash)
);

-- Solver proposals table
CREATE TABLE solver_proposals (
    id BIGSERIAL PRIMARY KEY,
    intent_hash BYTEA NOT NULL,
    solver_address BYTEA NOT NULL,
    proposed_output_amount NUMERIC NOT NULL,
    solver_fee_bps INT NOT NULL,
    signature BYTEA NOT NULL,
    submitted_at TIMESTAMP DEFAULT NOW(),
    accepted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (intent_hash) REFERENCES intents(intent_hash)
);
```

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
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Active baseline — bump version when stack changes materially |