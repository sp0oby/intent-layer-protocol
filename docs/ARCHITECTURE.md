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

**Why this architecture is P2P-first.** Layer 2 attempts a direct P2P match between two real-user intents BEFORE opening the solver auction. When a P2P match exists, the trade settles user-to-user at mutually-agreed pricing — no solver margin, no capital pre-locked on every chain by intermediaries, no compliance pipeline gating who can be a counterparty. This is the original peer-to-peer ethos of decentralized finance applied to cross-chain settlement, and it's strictly better for the user along every axis when a counterparty exists. The bonded-solver auction (Phase 2A) handles the cases where no counterparty is available. See [Whitepaper § Why direct P2P matching matters](WHITEPAPER.md#why-direct-p2p-matching-matters) for the full economic and decentralization argument.

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

> **Trust boundary:** the matcher's filtering above is an **efficiency optimization**, not a security boundary. The destination contract independently enforces token compatibility, chain compatibility, and both sides' `minDestAmount` against the source-side parameters carried in the LayerZero payload (sourced from the source contract's own storage). A buggy or malicious matcher cannot cause a settlement that violates either user's signed `minDestAmount` or `destToken` — at worst it can submit a doomed `executeMatching` call, after which the source intent is recoverable via `refundIfLzTimeout`. See [Stage 3 final review § R-16](STAGE_3_FINAL_REVIEW.md).

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

#### 1. IntentSettler.sol (same on every chain)

```solidity
contract IntentSettler is IIntentSettler, EIP712, ReentrancyGuard {
    // Storage — full Intent kept for off-chain readability; metadata packed
    // into one slot (state + settled + 3 timestamps) for ~21k gas savings
    // per submit and ~44k per state transition.
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => IntentMeta) internal _meta;
    mapping(address => mapping(uint256 => bool)) public usedNonces; // set, not counter
    mapping(bytes32 => address) public matchedRecipient;            // set in Stage 2

    // Events — `IntentSubmitted` carries the full Intent so indexers can
    // reconstruct order-book rows from a single log. `IntentMatched` carries
    // both hashes so the indexer knows the cross-chain pair.
    event IntentSubmitted(bytes32 indexed intentHash, address indexed user, Intent intent);
    event IntentCancelled(bytes32 indexed intentHash);
    event IntentMatched(bytes32 indexed localHash, bytes32 indexed remoteHash);
    event AuctionOpened(bytes32 indexed intentHash, uint256 auctionDeadline);
    event IntentLocked(bytes32 indexed intentHash);
    event IntentSettled(bytes32 indexed intentHash, address indexed recipient, uint256 amount);
    event IntentRefunded(bytes32 indexed intentHash, address indexed recipient, uint256 amount);

    // Core functions — `executeMatching` takes ONLY the two intent hashes.
    // Token + chain + amount validation happens on the destination chain
    // using authoritative source-side parameters carried in the LayerZero
    // payload. The matcher cannot bypass `minDestAmount` or `destToken`
    // because there is no caller-supplied price field.
    function submitIntent(Intent calldata intent) external payable returns (bytes32);
    function cancelIntent(bytes32 intentHash) external;
    function executeMatching(bytes32 localHash, bytes32 remoteHash) external payable;
    function openAuction(bytes32 intentHash) external;
    function refundIfLzTimeout(bytes32 intentHash) external;
}
```

**State machine** (canonical names match the Solidity enum):

```
None → Pending → Matched   →  Locked  →  Settled
           ↓
       Auctioning → … (Stage 3) → Settled

Cancelled and Refunded are terminal off-path states.
```

`Pending` corresponds to legacy "SUBMITTED"; `Auctioning` to "AUCTIONED";
`Settled` to "CONFIRMED"; `Refunded` is reached via `refundIfLzTimeout` after
a LayerZero delivery failure (Stage 2). `submitIntent` always lands in
`Pending`; `executeMatching` transitions Pending → Matched (Stage 1) and
will trigger the LayerZero send (Stage 2).

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

**Solution:** Two-Phase Commit with timeout-based recovery.

```
Phase 1: Match + send (executeMatching on source chain)
├─ Validates state + price + deadline locally
├─ Transitions local intent: Pending → Matched
└─ Sends LayerZero message to destination chain (Stage 2)

Phase 2: Lock + release (destination _lzReceive, Stage 2)
├─ Validates message version + trusted peer
├─ Transitions remote intent: Pending → Locked
├─ Releases destination token to source-chain user
└─ Sends confirmation back

Phase 3: Settle (source _lzReceive on confirmation, Stage 2)
├─ Transitions local intent: Matched → Settled
└─ Releases source token to destination-chain user

Recovery: If the destination LayerZero message never delivers, the source
user can call `refundIfLzTimeout(intentHash)` after `LZ_TIMEOUT = 30 minutes`
to recover funds. The 30-minute window is intentionally longer than the
expected 3–5 minute settlement so users do not get spurious refunds during
normal LayerZero confirmation latency.
```

**Code:**

```solidity
enum IntentState { None, Pending, Matched, Auctioning, Locked, Settled, Cancelled, Refunded }

struct IntentMeta {
    IntentState state;
    bool settled;
    uint64 submittedAt;
    uint64 matchTimestamp;
    uint64 auctionDeadline;
}
mapping(bytes32 => IntentMeta) internal _meta;

uint256 public constant LZ_TIMEOUT = 30 minutes;

function refundIfLzTimeout(bytes32 intentHash) external {
    IntentMeta memory meta = _meta[intentHash];
    require(meta.state == IntentState.Matched, "not matched");
    require(block.timestamp >= meta.matchTimestamp + LZ_TIMEOUT, "too early");
    // Effects: state → Refunded; Interactions: refund escrow.
}
```

### Data Models

**Intent State Machine** (canonical names match the on-chain enum):

```
None → Pending ──[executeMatching]──→ Matched ──[LZ confirm]──→ Settled
            │
            ├─[openAuction after 30s]─→ Auctioning ──[counterpart match]──→ Matched
            │
            └─[cancelIntent / expired]─→ Cancelled (terminal, refunded)
                                                        ↑
                                                Refunded ←─[refundIfLzTimeout]
```

`Pending` is the post-submission state (legacy "SUBMITTED"). `Auctioning`
is the solver-auction lane (legacy "AUCTIONED"). `Refunded` is reached
only via the LayerZero timeout recovery path.

**Phase 1 settlement is atomic.** On the destination chain, `_handleExecuteMatch`
validates the local intent, marks it `Settled`, releases tokens, and sends
the `CONFIRM` reply — all in one transaction. There is no observable window
between "committed" and "released." The `Locked` enum value exists for
**reservation** only: Phase 2B may introduce an async-settlement design
(HTLC / optimistic settlement / escrow review windows) that uses it. Keeping
the index stable means a future `IntentSettler` revision can adopt `Locked`
without re-shuffling the enum and breaking off-chain readers.

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

**Stage 1 measured costs** (from `.gas-snapshot`, per-test totals include
the `setUp` deploy of `IntentSettler` + `ChainPeerRegistry`; the *incremental*
cost of each operation is roughly half the test number):

| Operation | Test gas | Incremental est. |
|-----------|---------:|-----------------:|
| `submitIntent` (native ETH) | 246,728 | ~140k |
| `submitIntent` (ERC-20) | 343,119 | ~180k |
| `cancelIntent` (ETH refund) | 279,061 | ~50k |
| `cancelIntent` (ERC-20 refund) | 352,007 | ~85k |
| `executeMatching` (Stage 1, no LZ yet) | 269,686 | ~45k |
| `openAuction` | 269,787 | ~45k |

Stage 2 adds ~30–50k for `_lzSend` + `_lzReceive` gas accounting.

**Optimizations applied in Stage 1:**

- **Packed `IntentMeta` struct** — state, settled flag, and three `uint64`
  timestamps in a single 32-byte slot. Saves ~21k gas per `submitIntent`
  and ~44k per state transition vs. five separate mappings.
- **Field-level reads in hot paths** — `cancelIntent` and `executeMatching`
  read only the four to five Intent fields they need rather than copying
  the full 10-field struct from storage to memory.
- **Custom errors** instead of `require` strings — saves ~20–50 gas per
  revert path.
- **`uint64` timestamps** — fits in the packed slot, safe until year 2554.

**Future optimization candidates** (not applied — measured trade-off):

- **Trim Intent storage** — only persist `user`, `refundTo`, `sourceToken`,
  `sourceAmount`, `minDestAmount`, `deadline`, `destChainId`. Saves ~3 SSTOREs
  per submit (60k gas) at the cost of indexer-only reads for the dropped
  fields. Defer until Phase 2 when deploy-cost amortization is clearer.
- **Batch settlements** — process 10+ matched pairs in one transaction.
  Phase 2 design.
- **`viaIR` optimizer** — typical 5–15% gas saving on complex contracts.
  Enable for production deploy after compatibility check with Slither.

**Competitive vs. current bridges:**
- Stargate: ~0.25%
- Across: ~0.15%
- Intent Layer Protocol target: 0.10% + gas

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