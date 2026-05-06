# Intent Layer Protocol — Technical Architecture

**Audience:** Protocol engineers, security reviewers, senior contributors · **Version:** 1.0 · **Status:** Design baseline for Phase 1 MVP  
**See also:** [README](../README.md) · [MVP specification](MVP_SPECIFICATION.md) · [Technology stack](TECH_STACK.md) · [Contributing](../CONTRIBUTING.md)

---

## Overview

Intent Layer Protocol uses a three-layer architecture to enable cross-chain intent matching:

```
Layer 1: User Expression Layer
        ↓
Layer 2: Intent Matching & Auction Layer (Off-Chain)
        ↓
Layer 3: Settlement & Execution Layer (On-Chain)
```

---

## Layer 1: User Expression Layer

### Intent Format (ERC-7683 Compatible)

```solidity
struct Intent {
    // Source chain details
    uint256 sourceChainId;
    address sourceToken;
    uint256 sourceAmount;
    
    // Destination chain details
    uint256 destChainId;
    address destToken;
    uint256 minDestAmount;
    
    // User & timing
    address user;
    uint256 deadline;
    
    // Nonce for replay protection
    uint256 nonce;
}
```

### User Flow

```
1. User connects wallet (MetaMask)
2. Enters intent:
   - Amount: 1 ETH on Ethereum
   - Wants: 2400+ USDC on Base
   - Deadline: 5 minutes
3. System shows:
   - Current matching status
   - Best price available
   - Estimated time to settlement
4. User signs intent
5. Intent is submitted to source chain settlement contract
6. Escrow is held until settlement completes
```

### Frontend Interface

Simple form with 3 inputs:
- `amount` (source asset quantity)
- `token_out` (destination token address)
- `min_amount_out` (slippage protection)

Display:
- "Finding matching intents... 2/10 found"
- "Fallback to solver auction in 25 seconds"
- "Estimated cost: $0.12"

---

## Layer 2: Intent Matching & Auction Engine (Off-Chain)

### Architecture

```
┌──────────────────────────────────┐
│   Intent Indexer                 │
│  Listens to chain events         │
│  Stores intents in order book    │
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│   Matching Engine                │
│  Finds opposite intents (P2P)    │
│  Intent A: 1 ETH → USDC          │
│  Intent B: 2400 USDC → ETH       │
│  MATCH! (ok)                     │
└──────────────┬───────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
  Match Found      No Match
      │                 │
      │          ┌──────▼──────────┐
      │          │ Solver Auction  │
      │          │ Open auction    │
      │          │ 30 sec window   │
      │          │ Solvers bid     │
      │          └──────┬──────────┘
      │                 │
      └────────┬────────┘
               │
        ┌──────▼──────────┐
        │ Settlement Call │
        │ Execute on-chain│
        └────────────────┘
```

### Intent Indexer

**Responsibilities:**
- Listen to IntentSubmitted events on Ethereum
- Listen to IntentSubmitted events on Base
- Store in persistent order book (PostgreSQL)
- Maintain order book state

**Technology:**
- Blockchain event listeners (ethers.js)
- Order book database (PostgreSQL)
- Real-time updates (WebSocket)

### Matching Engine

```typescript
function findMatch(intent: Intent): Intent | null {
    // Find opposite intents in order book
    const oppositeIntents = orderBook.filter(other => {
        return (
            other.sourceChain === intent.destChain &&
            other.destChain === intent.sourceChain &&
            other.sourceToken === intent.destToken &&
            other.destToken === intent.sourceToken &&
            other.sourceAmount >= intent.minDestAmount &&
            intent.sourceAmount >= other.minDestAmount &&
            !isExpired(other) &&
            isPriceAcceptable(intent, other)
        );
    });
    
    if (oppositeIntents.length > 0) {
        // Multiple matches: choose best price for user
        return selectBestMatch(intent, oppositeIntents);
    }
    
    return null; // No match, go to solver auction
}
```

**Matching Criteria:**
- Opposite chains (Ethereum ↔ Base)
- Opposite tokens (ETH ↔ USDC)
- Price acceptable to both parties
- Not expired
- Both parties still have valid balance/allowance

### Solver Auction

**Triggered when:** No direct match found

**Process:**

```
Auction Opens (t=0)
├─ Intent goes to solver auction pool
└─ Solvers notified via webhook/API

Solver Submission (t=0-30s)
├─ Solvers query current state
└─ Submit signed settlement proposals
   Format: {intent_hash, proposed_output_amount, solver_fee}

Winner Selection (t=30s)
├─ Select solver with best output price
└─ Call settlement contract with winning proposal

Execution (t=30-60s)
├─ Settlement contract validates signature
└─ Transfers happen atomically across chains
```

**Solver Competition:**
```
Solver A: 2410 USDC (fee: 0.05%)
Solver B: 2405 USDC (fee: 0.06%)
Solver C: 2395 USDC (fee: 0.04%)

Winner: Solver A (best price for user)
```

---

## Layer 3: Settlement & Execution Layer (On-Chain)

### Smart Contracts Overview

#### ChainPeerRegistry.sol (deploy on **each** chain)

- **Role:** On-chain **routing config** — maps canonical `chainId` → LayerZero V2 **endpoint id** (`lzEidForChain`) and gates which **`(sourceChainId → destChainId)`** corridors are enabled (`isRouteSupported`). Same bytecode on every chain; **config differs per deployment**.
- **Pairs with:** `IntentSettler` constructor address; LayerZero **OApp `setPeer`** for remote contract addresses. Registry does **not** replace `setPeer`; it replaces **hardcoded EIDs** and gives a **single place** to widen or narrow routes.
- **Source:** [`contracts/src/ChainPeerRegistry.sol`](../contracts/src/ChainPeerRegistry.sol), [`IChainPeerRegistry.sol`](../contracts/src/interfaces/IChainPeerRegistry.sol).

#### 1. IntentSettler.sol (Ethereum)

```solidity
contract IntentSettler {
    // State
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => bool) public settled;
    mapping(address => uint256) public nonces;
    
    // Events
    event IntentSubmitted(
        bytes32 indexed intentHash,
        address indexed user,
        uint256 amount,
        address token
    );
    
    event IntentMatched(bytes32 indexed intentHash);
    
    event IntentSettled(
        bytes32 indexed intentHash,
        address indexed recipient,
        uint256 amount
    );
    
    // Core functions
    function submitIntent(Intent calldata intent) external;
    function settleIntent(
        bytes32 intentHash,
        bytes calldata solverSignature
    ) external;
    function executeMatching(
        bytes32 intentHashA,
        bytes32 intentHashB
    ) external;
    function cancelIntent(bytes32 intentHash) external;
}
```

**Responsibilities:**
- Receive intents from users
- Escrow source tokens
- Validate intent signatures
- Execute matched intents
- Resolve LayerZero **destination EID** via **`ChainPeerRegistry.lzEidForChain(intent.destChainId)`** (not a hardcoded Base constant); send messages through LayerZero OApp

#### 2. IntentSettler.sol (Base)

Same interface as Ethereum, but:
- Receives LayerZero messages from Ethereum
- Releases escrow tokens on Base
- Sends confirmation messages back to Ethereum

#### 3. SolverAuction.sol

```solidity
contract SolverAuction {
    struct AuctionProposal {
        bytes32 intentHash;
        address solver;
        uint256 outputAmount;
        uint256 solverFee;
        bytes signature;
        uint256 timestamp;
    }
    
    mapping(bytes32 => AuctionProposal[]) public proposals;
    
    function submitProposal(
        bytes32 intentHash,
        uint256 outputAmount,
        uint256 solverFee,
        bytes calldata signature
    ) external;
    
    function executeWinningProposal(bytes32 intentHash) external;
}
```

### Cross-Chain Communication (LayerZero V2)

```
Ethereum IntentSettler
    │
    ├─ User submits intent
    ├─ Tokens escrowed
    │
    └─ Matching result found on Base
       └─ Send message via LayerZero:
          {
            receiver: baseIntentSettler,
            message: {
              type: "EXECUTE_MATCH",
              intentHashEth: 0x...,
              intentHashBase: 0x...,
              userEth: 0x...,
              userBase: 0x...,
              amountA: 1 ETH,
              amountB: 2400 USDC
            }
          }
       
       └─ Base IntentSettler receives message
          └─ Verifies signatures
          └─ Releases USDC to userEth (on Base)
          └─ Sends confirmation back to Ethereum
       
       └─ Ethereum IntentSettler receives confirmation
          └─ Releases ETH to userBase (on Ethereum)
```

### LayerZero Integration

```solidity
import "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

contract IntentSettler is OApp {
    // Cross-chain message sending
    function _lzSend(
        uint32 destChainId,
        bytes calldata message,
        bytes calldata options
    ) internal {
        // Calls LayerZero endpoint
        // Message is delivered to destination chain
        // Costs gas + LayerZero fee
    }
    
    // Receive cross-chain messages
    function _lzReceive(
        address _oappAddress,
        uint32 _srcEid,
        bytes calldata _message
    ) internal override {
        // Process message from other chain
        // Execute settlement if valid
    }
}
```

### Multi-chain extensibility (design now, scale later)

Phase 1 ships **Ethereum + Base**, but settlement should be **chain-agnostic** so adding another chain is **ops + configuration**, not a rewrite.

**Principles**

1. **One logical contract per chain** — deploy the same `IntentSettler` (and auction/OApp peers) on each chain you support. A new chain means a **new deployment there**, not a new “protocol version” unless you intentionally upgrade logic.
2. **No hardcoded destinations in core logic** — Resolve “where to send this message” from **`intent.destChainId`** plus a **configurable mapping** (e.g. LayerZero **endpoint id `dstEid`** → trusted **remote OApp address**). LayerZero’s **OApp `setPeer`** pattern is the standard way to register remotes per destination endpoint id.
3. **Validate the intent against this chain** — On `submitIntent`, require `intent.sourceChainId == block.chainid` (or equivalent) so users cannot replay intents meant for another origin.
4. **Support matrix is explicit** — Maintain an **allowlist** (or tiered limits) for `(sourceChainId, destChainId, token…)` so you can enable routes gradually and tune risk per corridor.
5. **Version cross-chain payloads** — Prefix `abi.encode` payloads with a **`uint8 messageVersion`** (or use typed structured hashes) so you can evolve formats without breaking old peers; old peers ignore or reject unknown versions cleanly.
6. **Governance or admin for topology changes** — Whoever controls `setPeer` and **`ChainPeerRegistry`** (`setLzEidForChain`, `setRouteSupported`) should be **multisig / timelock / governance** in production, not an EOA.

**On-chain building blocks (repository)**

- [`ChainPeerRegistry.sol`](../contracts/src/ChainPeerRegistry.sol) — per-chain deployment: `chainId` → LayerZero **EID**, plus **`isRouteSupported(source, dest)`** for rollout control. [`IntentSettler`](../contracts/src/IntentSettler.sol) optionally references it in the constructor; production should pass a real registry.

**What “add Arbitrum” looks like (target state)**

- Deploy `ChainPeerRegistry` + `IntentSettler` (OApp) on Arbitrum; wire LayerZero endpoint.
- On **Ethereum, Base, and Arbitrum**, call **`setPeer(arbitrumEid, arbitrumSettlerAddress)`** (and reciprocal peers) so every participant trusts the new remote.
- On **each** existing `ChainPeerRegistry`, call **`setLzEidForChain(arbitrumChainId, arbitrumLzEid)`** and **`setRouteSupported`** for new corridors you want to expose.
- Update **off-chain** config (indexer RPC, matcher supported pairs, UI chain list).
- No redeploy on old chains **if** peers and routes were always **storage-driven**; you only redeploy if you need a **new bytecode** for unrelated reasons.

**Anti-patterns to avoid in implementation**

- Constants like `DEST_EID_BASE` baked into settlement paths (fine in **tests**, not in production `IntentSettler`).
- Separate “EthereumToBaseSettler” and “BaseToEthereumSettler” contracts — use **one** settler + **direction in the intent**.
- Accepting messages from any LayerZero source without checking **`_srcEid`** against a **trusted peer** mapping.

### Atomicity & Safety

**Problem:** What if Ethereum confirms but Base fails?

**Solution:** Two-Phase Commit

```
Phase 1: Lock (both chains lock tokens)
├─ Ethereum: Lock ETH in escrow
└─ Base: Lock USDC in escrow

Phase 2: Commit (release tokens)
├─ If both chains agree: Release tokens
└─ If one chain fails: Both refund after timeout

Timeout: 10 blocks (~2 minutes)
```

**Code:**

```solidity
enum IntentState { PENDING, LOCKED, SETTLED, CANCELLED }

mapping(bytes32 => IntentState) public intentState;
mapping(bytes32 => uint256) public intentLockTime;

function cancelIfTimeout(bytes32 intentHash) external {
    if (block.timestamp > intentLockTime[intentHash] + 600) {
        // Refund to user
        refund(intentHash);
    }
}
```

### Data Models

**Intent State Machine:**

```
SUBMITTED
    ↓
MATCHED (if P2P match found) OR AUCTIONED (if no match)
    ↓
LOCKED (on both chains)
    ↓
SETTLED (tokens released)
    
OR
    
CANCELLED (timeout or user cancel)
```

**Order Book Schema:**

```sql
CREATE TABLE intents (
    intent_hash BYTES32 PRIMARY KEY,
    user_address ADDRESS,
    source_chain_id INT,
    source_token ADDRESS,
    source_amount BIGINT,
    dest_chain_id INT,
    dest_token ADDRESS,
    min_dest_amount BIGINT,
    deadline BIGINT,
    state VARCHAR(20),
    created_at TIMESTAMP,
    settled_at TIMESTAMP NULL
);

CREATE INDEX idx_intent_chains ON intents(source_chain_id, dest_chain_id);
CREATE INDEX idx_intent_state ON intents(state);
CREATE INDEX idx_intent_deadline ON intents(deadline);
```

### Gas Optimization

**Phase 1 Costs (Ethereum):**

Per-intent operations:
- `submitIntent`: ~100k gas (approval + submission)
- `executeMatching`: ~150k gas (2 intents)
- LayerZero message: ~200k gas on dest chain

**Cost breakdown (at 30 gwei):**
- User cost: ~3-5 USDC
- Protocol cost: ~6-10 USDC
- Total: ~$0.10-0.15 per transaction

**Competitive vs. current bridges:**
- Stargate: ~0.25%
- Across: ~0.15%
- Intent Layer Protocol: 0.10% + gas

**Optimization Strategies:**
- Batch settlements - Process 10+ intents in one transaction
- Off-chain order book - Reduce on-chain storage
- Calldata compression - Pack intent data efficiently
- LayerZero optimization - Use cheaper message types

---

## Security Considerations

### Attack Vectors & Mitigations

**1. Replay Attack**
- Mitigation: Nonce field + chain ID in intent hash
- Code: `keccak256(abi.encode(intent, nonce, chainId))`

**2. MEV Extraction**
- Mitigation: Phase 1 uses public solver auction (transparent)
- Future: Encrypted intents with threshold encryption

**3. Solver Griefing**
- Problem: Solver submits valid proposal but doesn't execute
- Mitigation: Solver must bond collateral (ILP tokens later)
- Current: Rate limiting + reputation system

**4. Double Settlement**
- Mitigation: Boolean flag `settled[intentHash] = true` prevents double execution

**5. User Cancellation**
- Mitigation: Only user or expired intent can be cancelled
- Timeout: 10 blocks (~2 minutes)

---

## Dependencies & External Systems

**Smart Contract Dependencies:**
```
@layerzerolabs/oapp-evm ^2.0.0
@openzeppelin/contracts ^5.0.0
```

**Off-Chain Dependencies:**
```
ethers.js - Blockchain interaction
PostgreSQL - Order book
Node.js - Backend services
React - Frontend
MetaMask - Wallet integration
```

**Blockchain Confirmations:**
- Ethereum: 12 blocks (safe finality) ~3 minutes
- Base: 1 block (L2 finality) ~2 seconds
- LayerZero: 10 blocks confirmation + proof ~2-3 minutes
- Total settlement time: 3-5 minutes (Phase 1)
- Future (Phase 2): <30 seconds with fast finality

---

## Performance Targets (Phase 1)

| Metric | Target | Notes |
|--------|--------|-------|
| Intent Matching Latency | <5 seconds | Time to find match |
| Settlement Time | 3-5 minutes | Cross-chain finality |
| Gas Per Transaction | 100-150k | User + protocol combined |
| Max Throughput | 1000 intents/min | With 1 relayer |
| P2P Match Rate | 60%+ | % of intents matched directly |
| Slippage (avg) | <0.15% | Better than bridges |

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Baseline architecture — open PRs for material design changes with MVP spec alignment |