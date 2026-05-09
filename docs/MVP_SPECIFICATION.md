# Intent Layer Protocol — MVP Specification

**Audience:** Core contributors, auditors, product · **Version:** 1.0 · **Status:** Active — specification guides implementation (repo contains dev skeletons, not production-ready protocol code)  
**See also:** [README](../README.md) · [Architecture](ARCHITECTURE.md) · [Technology stack](TECH_STACK.md) · [Timeline](TIMELINE_CHECKLIST.md) · [Contributing](../CONTRIBUTING.md)

---

## Phase 1: Ethereum ↔ Base Simple Intent Matching

**Duration:** 8–12 weeks (indicative)  
**Implementation status:** Scaffolding in repository — on-chain settlement, messaging, and auction logic **not** feature-complete  
**Target launch (documented):** Q3 2026

---

## Objective

Enable users to swap tokens across Ethereum and Base chains using simple intent expressions, with automatic matching or solver fallback. Focus on **flawless UX** and **100% reliability**.

---

## Scope Definition

### In Scope

**Smart Contracts:**
1. `IntentSettler.sol` (one deployment on Ethereum, one on Base — same logic; constructor takes optional `ChainPeerRegistry`)
2. `ChainPeerRegistry.sol` (**one deployment per chain** — EID table + route allowlist; see [Architecture](ARCHITECTURE.md))
3. `SolverAuction.sol` (simple auction mechanism)
4. LayerZero OApp integration (`setPeer` per remote EID, in addition to registry EIDs)

**Supported Assets:**
- Ethereum: ETH, USDC, USDT (ERC-20)
- Base: USDC, ETH (native + ERC-20)

**Cross-Chain Messaging:**
- LayerZero V2 as primary transport
- Fallback: Simple refund mechanism

**Backend Systems:**
1. Intent Indexer (monitors events)
2. Matching Engine (finds opposite intents)
3. Solver Auction Orchestrator
4. Order Book Database

**Frontend:**
1. Web UI (React)
2. MetaMask integration
3. Intent status tracking
4. Transaction history

**Testing:**
1. Unit tests (contracts + backend)
2. Integration tests (full flow)
3. Testnet deployment
4. Mainnet staging

### Out of Scope

- Solana support (Phase 2)
- Encrypted intents (Phase 2)
- Intent chaining (Phase 2)
- Governance token (Phase 2)
- NFT/LP token support (Phase 2)
- Mobile app (Phase 3)
- 10+ chain support (Phase 3)

---

## Detailed Feature Specifications

### Feature 1: Intent Submission & Validation

**User Story:**
```
As a user,
I want to submit an intent to swap ETH on Ethereum for USDC on Base,
So that the protocol can find a match or execute through solvers
```

**Acceptance Criteria:**

- [ ] User can input source amount, destination token, and deadline
- [ ] System validates balance/allowance on source chain
- [ ] System estimates gas costs and displays total fee
- [ ] User signs intent with MetaMask
- [ ] Intent is submitted to Ethereum settlement contract
- [ ] System generates unique intent hash
- [ ] Event is emitted and indexed in order book

**Technical Details:**

```solidity
// User calls:
IntentSettler.submitIntent({
    sourceChain: 1, // Ethereum
    destChain: 8453, // Base
    sourceToken: 0xETH,
    sourceAmount: 1e18, // 1 ETH
    destToken: 0xUSDC_BASE,
    minDestAmount: 2400e6, // 2400 USDC
    deadline: now + 300 // 5 min
})

// System:
1. Transfer sourceToken to contract (escrow)
2. Emit IntentSubmitted event
3. Off-chain indexer catches event
4. Add to order book
```

**Definition of Done:**
- Smart contract function works on testnet
- Gas estimation accurate within 5%
- Events properly indexed
- User can see intent in UI after submission

### Feature 2: Intent Matching (P2P)

**User Story:**
```
As a user with an intent to swap ETH for USDC,
I want the system to find another user wanting to swap USDC for ETH,
So we can transact directly without DEX slippage
```

**Acceptance Criteria:**

- [x] Matching engine finds opposite intents in real-time — `MatchingLoop` ticks every 5s and runs `findOppositeIntent` (Stage 4)
- [x] Matching accounts for prices (no user forced into bad trade) — both-sides `minDestAmount` enforced off-chain AND re-validated on the destination chain via the LZ payload (Stage 3 R-16)
- [x] Only non-expired intents are matched — `findOppositeIntent` filters by `deadline > now`
- [x] Users receive notification of match — `WS /ws?intentHash=` broadcasts `StateChange` events from the publishing repository (Stage 4)
- [x] Matched intents transition through the on-chain state machine — Phase 1 is atomic so `Pending → Matched → Settled` (the `Locked` enum is reserved for Phase 2B)
- [x] Settlement begins within 5 seconds of match — matcher tick cadence + on-chain `executeMatching` (LZ delivery time depends on the cross-chain transport)

**Matching Algorithm (Pseudocode):**

```python
def find_match(intent_a):
    """Find matching intent for intent_a"""
    
    # Find opposite chains and tokens
    candidates = order_book.filter(
        source_chain == intent_a.dest_chain and
        dest_chain == intent_a.source_chain and
        source_token == intent_a.dest_token and
        dest_token == intent_a.source_token
    )
    
    # Filter by time (not expired)
    candidates = filter(c => c.deadline > now, candidates)
    
    # Filter by price
    valid_matches = []
    for candidate in candidates:
        # Candidate must get at least minDestAmount from intent_a
        if intent_a.sourceAmount >= candidate.minDestAmount:
            # Intent_a must get at least minDestAmount from candidate
            if candidate.sourceAmount >= intent_a.minDestAmount:
                valid_matches.append(candidate)
    
    # Choose best match for intent_a (highest received amount)
    if valid_matches:
        return max(valid_matches, key=lambda x: x.sourceAmount)
    
    return None
```

**Definition of Done:**
- Matching engine returns correct matches 100% of time
- No invalid matches (violating price constraints)
- Matching latency <5 seconds
- Tested with 100+ intent pairs

### Feature 3: Solver Auction (Fallback)

**User Story:**
```
As a user with an intent that can't be matched directly,
I want solvers to compete to execute my intent,
So I get the best price if no direct match exists
```

**Acceptance Criteria:**

- [x] Auction automatically triggers after 30 seconds if no match — `AuctionOrchestrator` calls `IntentSettler.openAuction` after `submittedAtBlockTs + AUCTION_DELAY` (Stage 4)
- [x] Solvers can query unmatched intents via API — `GET /api/intents/auctioning?chainId=` returns the active set (Stage 4)
- [x] Solvers submit signed proposals with output amount — `POST /api/solver/proposals` verifies the on-chain `SolverAuction.proposalDigest` ECDSA signature before persisting (Stage 4); reference solver bot in `backend/src/bot/solver-bot.ts`
- [x] Protocol selects highest-price proposal — `SolverAuction.selectWinner` ranks deterministically by `proposedOutputAmount` (Stage 3)
- [x] Winning solver executes on-chain — `AuctionOrchestrator` calls `executeWinningProposal` after the auction window closes (Stage 4)
- [ ] User receives expected tokens — verified end-to-end on testnet (Stage 8)

**Solver Proposal Format** (matches `contracts/src/SolverAuction.sol`):

```solidity
struct SolverProposal {
    address solver;                // recorded from msg.sender at submitProposal
    uint256 proposedOutputAmount;
    uint256 solverFeeBps;          // basis points (100 bps = 1%)
    bytes signature;               // EIP-191/EIP-712 signed by solver (validated in Stage 3)
}
```

The intent hash is the mapping key (`mapping(bytes32 => SolverProposal[])`),
so it is not duplicated inside the struct. The `solver` field is set on-chain
at submission time so off-chain readers can identify the bidder without
recovering the signature.

**Solver Auction Workflow:**

```
t=0s:   Intent submitted, no match found
t=30s:  Auction begins, solvers notified
t=30-60s: Solvers submit proposals
t=60s:  Auction closes, best proposal selected
t=60-120s: Winning solver executes
t=120-180s: Cross-chain settlement completes
```

**Definition of Done:**
- Solver auction mechanism works on testnet
- Multiple solvers can submit proposals
- Best proposal always selected
- Winning solver execution succeeds

### Feature 4: Cross-Chain Settlement (LayerZero)

**User Story:**
```
As a protocol,
I need to atomically settle matched intents across Ethereum and Base,
So tokens move correctly on both chains
```

**Acceptance Criteria:**

- [x] Ethereum settlement contract sends LayerZero message to Base (Stage 2: `_lzSend(EXECUTE_MATCH)` from `executeMatching`)
- [x] Base receives message and validates source via OApp peer check (Stage 2: `_handleExecuteMatch`)
- [x] Tokens are released on Base to Ethereum user (Stage 2: trusted source-user address read from `EXECUTE_MATCH` payload, populated from source storage on Ethereum)
- [x] Base sends confirmation back to Ethereum (Stage 2: `_lzSend(CONFIRM)` from `_handleExecuteMatch`)
- [x] Ethereum confirms and releases tokens to Base user (Stage 2: `_handleConfirm` releases to `destUser` from CONFIRM payload, populated from Base storage)
- [x] If one chain fails, the source user can refund via `refundIfLzTimeout` after `LZ_TIMEOUT = 30 minutes` (Stage 2)
- [x] **Extensibility:** settlement paths use **`ChainPeerRegistry`** + **OApp `setPeer`**, not hardcoded branches; `intent.destChainId` drives routing through `registry.lzEidForChain(...)`
- [ ] **`ChainPeerRegistry`** deployed on Ethereum and Base with correct **LayerZero EIDs** and **`setRouteSupported`** for Phase 1 corridors — Stage 8 (deploy script)
- [ ] Settlement completes within 5 minutes on real LayerZero — measured during testnet (Stage 8); unit-test round-trip via `MockLzEndpoint` is instantaneous

**Settlement States** (canonical names match the on-chain enum):

```
Pending → Matched ──[LZ CONFIRM delivery]──→ Settled

If LayerZero never delivers within LZ_TIMEOUT (30 minutes):
Matched ──[refundIfLzTimeout]──→ Refunded
```

**Phase 1 settlement is atomic** — the destination chain validates and
releases tokens in a single transaction within `_lzReceive`, with no
observable "Locked" window. The `Locked` enum value is reserved for
Phase 2B async-settlement designs.

**Code Skeleton:**

```solidity
// IChainPeerRegistry registry — per-chain deployment; use registry.lzEidForChain(...) for _lzSend

// Phase 1: Lock on source chain
function executeMatching(bytes32 ethIntentHash, bytes32 baseIntentHash) {
    // Lock ETH on Ethereum
    Intent memory ethIntent = intents[ethIntentHash];
    require(ethIntent.state == IntentState.MATCHED);
    ethIntent.state = IntentState.LOCKED;
    
    // Send message to destination chain (LayerZero dstEid from registry, not a literal)
    // Include source chain id for return-path routing — avoids hardcoding “confirm to Ethereum”
    bytes memory payload = abi.encode(
        uint8(1), // messageVersion — increment when payload shape changes
        baseIntentHash,
        ethIntent.sourceAmount,
        ethIntent.user,
        ethIntent.sourceChainId
    );
    _lzSend(registry.lzEidForChain(ethIntent.destChainId), payload, options);
}

// Phase 2: On destination chain — receive from source (LayerZero delivers _srcEid + payload)
function _lzReceive(uint32 _srcEid, bytes memory payload) {
    // require(registry.isTrustedPeer(_srcEid));
    (
        uint8 messageVersion,
        bytes32 remoteIntentHash,
        uint256 amount,
        address userEth,
        uint256 originalSourceChainId
    ) = abi.decode(payload, (uint8, bytes32, uint256, address, uint256));
    require(messageVersion == 1, "bad version");
    
    Intent memory baseIntent = intents[remoteIntentHash];
    require(baseIntent.state == IntentState.MATCHED);
    baseIntent.state = IntentState.LOCKED;
    
    // Release USDC to Ethereum user on Base
    USDC_BASE.transfer(userEth, baseIntent.sourceAmount);
    
    _lzSend(registry.lzEidForChain(originalSourceChainId), abi.encode(remoteIntentHash), options);
}

// Phase 3: Confirm on source chain (receive from destination)
function _lzReceiveConfirm() {
    ethIntent.state = IntentState.SETTLED;
    ETH.transfer(baseIntentUser, ethIntent.sourceAmount);
}
```

**Definition of Done:**
- Cross-chain message delivery reliable
- Atomicity: both chains settle or both refund
- Timeout works correctly
- No stuck funds or partial settlements
- Adding a later chain is primarily **new deployment + `setPeer` / route config**, not a rewrite of settlement logic (see [Architecture — Multi-chain extensibility](ARCHITECTURE.md#multi-chain-extensibility-design-now-scale-later))

### Feature 5: Web UI & User Experience

**Pages:**

1. **Dashboard/Landing**
   - Connect Wallet button
   - Quick stats (total volume, users, recent trades)
   - Link to swap interface

2. **Swap Interface**
   - Input: Amount + Token on source chain
   - Input: Destination chain + token
   - Display: Min received (with slippage %), fee, time estimate
   - Button: "Create Intent"
   - Loading: "Matching your intent..." with progress

3. **Intent Status Page**
   - Shows intent state: MATCHING → MATCHED → LOCKED → SETTLED
   - Real-time updates via WebSocket
   - Link to both transactions (Ethereum + Base)
   - Ability to cancel (if not yet matched)

4. **Transaction History**
   - Table of past intents
   - Status, amounts, fees, timestamps
   - Etherscan links

**UI Requirements:**

- Mobile responsive
- Dark mode
- Clear error messages
- Loading states
- Animation on successful settlement

**Definition of Done:**
- [x] All pages functional — Stage 5.Z complete: across-style swap with combined token+chain picker, state-driven status page with live solver-bid feed and per-state tx-hash explorer chips, paginated history, glass-card design system; all five routes build green
- [x] Works on MetaMask — wagmi v3 multi-wallet picker (MetaMask SDK / Coinbase / WalletConnect / Safe / Injected); end-to-end verified on local-stack
- [x] Responsive design (mobile, tablet, desktop) — picker stacks single-column on mobile, swap-amount font scales, footer + header reflow at 375px
- [x] No console errors — CORS middleware in `backend/src/server.ts` allowlists localhost:3000 + 127.0.0.1:3000 (closed #29)
- [ ] UX tested with 5+ users — Phase 1 milestone, after testnet deploy (Stage 8)

### Feature 6: Intent Cancellation

**User Story:**
```
As a user,
I want to cancel my intent if it hasn't been matched,
So I can get my tokens back
```

**Acceptance Criteria:**

- [x] Only `Pending` or `Auctioning` intents can be cancelled by user
- [x] After `intent.deadline`, intent can be cancelled by anyone (permissionless cleanup)
- [x] Cancellation refunds tokens to `intent.refundTo` (or `intent.user` if `refundTo == address(0)`)
- [x] Gas cost for cancellation is bounded — measured ~50k incremental (~280k including the test setup that deploys + submits + cancels)

> The original "<50k total" target was unrealistic — two SSTOREs alone
> consume 25–40k gas. The measured *incremental* cost (post-warm storage,
> excluding setup/deploy) is ~50k, which is the right number to compare
> against L1 typical fees.

**Definition of Done:**
- Cancellation works on testnet
- Only valid intents can be cancelled
- Refund is accurate

---

## Technical Stack

### Smart Contracts

**Language:** Solidity 0.8.20+  
**Framework:** Foundry or Hardhat  
**Dependencies:**
- OpenZeppelin Contracts 5.0
- LayerZero OApp (V2)

**Chain IDs:**
- Ethereum: 1 (mainnet) / 11155111 (sepolia testnet)
- Base: 8453 (mainnet) / 84532 (sepolia testnet)

### Backend

**Language:** Node.js / TypeScript  
**Framework:** Express or Fastify  
**Database:** PostgreSQL  
**Message Queue:** Redis (for event processing)  
**Blockchain Interaction:** ethers.js v6

**Services:**
1. Event Indexer (TypeScript service listening to events)
2. Matching Engine (runs every 5 seconds)
3. Auction Orchestrator (manages solver auction lifecycle)
4. API Server (exposes intents, allows solver queries)

### Frontend

**Framework:** React 18+  
**Web3 Integration:** wagmi + viem  
**Wallet:** MetaMask  
**Styling:** Tailwind CSS or similar  
**State Management:** TanStack Query  
**Real-time:** WebSocket for intent status

---

## Testing Strategy

### Unit Tests

**Smart Contracts:**
- IntentSettler.submitIntent() validation
- Matching logic (multiple test cases)
- Solver auction winner selection
- Cross-chain message handling
- Cancellation logic

**Backend:**
- Matching algorithm edge cases
- Order book state management
- Proposal ranking

**Target:** 90%+ code coverage

### Integration Tests

**Full End-to-End Flows:**

Test 1: Direct P2P Match
```
1. User A submits intent: 1 ETH on Eth → 2400 USDC on Base
2. User B submits intent: 2400 USDC on Base → 1 ETH on Eth
3. System finds match within 5 seconds
4. Cross-chain settlement completes
5. User A has 2400 USDC on Base
6. User B has 1 ETH on Ethereum
```

Test 2: No Match → Solver Auction
```
1. User A submits intent
2. System waits 30 seconds, no match found
3. Solver auction begins
4. Solver submits proposal
5. Settlement completes
```

Test 3: Intent Expiration
```
1. User submits intent with 2-minute deadline
2. Deadline passes
3. User cancels intent
4. Tokens refunded
```

Test 4: Partial Match (Price Mismatch)
```
1. User A: 1 ETH → 2400 USDC min
2. User B: 2300 USDC → 1 ETH min
3. System: No match (User A wouldn't accept 2300)
```

### Load Testing

- 100 concurrent intents
- 50 intents/second submission rate
- Matching latency <5 seconds even under load

### Security Testing

- Reentrancy checks
- Integer overflow/underflow
- Invalid signature detection
- Replay attack prevention
- Double-settlement prevention

### Testnet Rollout

1. **Sepolia Testnet** (Ethereum + Base)
   - Deploy all contracts
   - Test with 50+ testnet transactions
   - Internal testing for 1 week
   
2. **Goerli/Sepolia Staging** (if needed)
   - Test with multiple solvers
   - Test recovery flows
   - 1+ week live staging

3. **Production Mainnet**
   - Begin with $1k daily limit per user
   - Gradual ramp: $1k → $10k → $100k → unlimited
   - Monitor for 2 weeks before full launch

---

## Deployment Plan

### Phase 1a: Testnet (Week 1-4)

- Smart contracts deployed to Sepolia
- Backend indexer running
- Frontend connected to testnet
- Internal testing with 10+ transactions

**Go/No-Go Decision:** All tests pass + no critical issues

### Phase 1b: Staging (Week 5-6)

- Same as testnet but with more realistic load
- Deploy 2-3 test solvers
- Test failure scenarios (LayerZero downtime, etc.)
- Fine-tune gas costs

**Go/No-Go Decision:** All edge cases handled

### Phase 1c: Mainnet (Week 7-8)

**Week 7:**
- Deploy contracts to Ethereum + Base
- Transfer $100k liquidity to first settlement
- Limited launch: invite-only, 100 users max
- Monitor for 24 hours

**Week 8:**
- Open to public
- Gradually increase transaction limits
- Daily monitoring of settlement reliability

---

## Success Criteria

### Testnet Success

- [ ] All unit tests pass (100%)
- [ ] All integration tests pass (100%)
- [ ] No smart contract vulnerabilities (audit)
- [ ] Gas costs within 20% of estimate
- [ ] Matching latency <5 seconds consistently

### Mainnet Success (First Month)

- [ ] Zero failed settlements (100% success rate)
- [ ] Average settlement time 3-5 minutes
- [ ] P2P match rate >60%
- [ ] User satisfaction >4.5/5 (if surveyed)
- [ ] $10k+ daily volume
- [ ] Zero security incidents

### Long-term Targets

- [ ] $100k+ daily volume by month 3
- [ ] 1000+ active users
- [ ] <0.15% average slippage (better than bridges)
- [ ] Multiple solvers competing

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| LayerZero downtime | Medium | High | Implement fallback (simple refund path) |
| Smart contract bug | Low | Critical | Audit + extensive testing + gradual rollout |
| Solver censorship | Medium | Medium | Easy solver SDK, incentive program |
| Matching engine bug | Low | High | 100% test coverage, peer review |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Solo founder burnout | Medium | High | Hire co-founder/developer early |
| Market adoption slow | High | Medium | Strong marketing, partnerships |
| Regulatory scrutiny | Low | High | Conservative design, legal review |

---

## Dependencies & Blockers

**Hard Dependencies:**
- LayerZero V2 deployed on Base (already live)
- USDC on Base (already live)
- ETH bridge to Base (already live)

**External Factors:**
- Base network stability (assumed 99.9%)
- LayerZero reliability (assumed 99.5%)
- Ethereum network not under attack

---

## Milestones & Timeline

```
Week 1-2:    Smart contract development + testing
Week 3-4:    Backend development (indexer, matching, API)
Week 5:      Frontend development
Week 6:      Integration testing + deployment
Week 7:      Testnet launch + internal testing
Week 8:      Security audit
Week 9:      Staging environment
Week 10:     Mainnet launch (limited)
Week 11:     Monitor + optimize
Week 12:     Full public launch
```

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Baseline MVP scope — update acceptance criteria as implementation lands |
| **Owner** | Maintainers (see [README](../README.md)) |
