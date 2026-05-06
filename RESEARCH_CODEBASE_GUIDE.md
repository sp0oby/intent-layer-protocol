# Research Codebase Analysis Guide

This document guides you through understanding existing intent-based and cross-chain protocols to inform your design decisions.

---

## 1. CoW Protocol (Intent Matching Reference)

**Repository:** https://github.com/cowprotocol/contracts  
**Language:** Solidity  
**Key Files to Study:**

```
contracts/
├── GPv2Settlement.sol      (main settlement contract)
├── GPv2Encoding.sol        (order encoding)
├── GPv2AllowListAuthentication.sol  (signature validation)
└── libraries/
    └── GPv2SafeERC20.sol   (safe token transfers)
```

### What to Learn

1. **Order Format** (`GPv2Order`)
   - How do they encode orders?
   - How is an order identified (hash)?
   - What fields are required vs optional?

2. **Settlement Logic**
   - How are orders atomically settled?
   - How do they handle token transfers?
   - What's their flow batch model?

3. **Signature Verification**
   - How do they validate solver signatures?
   - How do they prevent replay attacks?
   - EIP-712 vs raw signatures?

### Code Sample to Study

```solidity
// From GPv2Settlement.sol
function settle(
    bytes calldata tokens,
    uint256[] calldata clearingPrices,
    Trade[] calldata trades,
    bytes[] calldata interactions,
    bytes calldata data
) external {
    // How do they settle multiple trades atomically?
    // How do they handle token transfers?
    // How do they call external contracts safely?
}
```

**Key Insight:** CoW Protocol's strength is efficient batch settlement. Study their fee mechanism and how they minimize MEV.

---

## 2. UniswapX (ERC-7683 Reference)

**Repository:** https://github.com/Uniswap/UniswapX  
**Language:** Solidity  
**Key Concept:** Fillers (solvers) compete to fill user intents

### What to Learn

1. **Intent Encoding** (ERC-7683)
   - What fields define an intent?
   - How is an intent hash calculated?
   - How does it differ from orders?

2. **Resolver Pattern**
   - How do fillers/solvers resolve intents?
   - What do they return vs execute?
   - How does settlement happen?

3. **Signature Scheme**
   - How are intents signed by users?
   - How do fillers prove they fulfilled it?
   - Replay protection mechanism?

### Code to Trace

```solidity
// Intent structure (approximate)
struct Intent {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 minAmountOut;
    uint256 deadline;
    // ... others
}
```

**Key Insight:** ERC-7683 is the standard everyone will follow. Make sure your protocol is compatible.

---

## 3. LayerZero V2 (Cross-Chain Messaging)

**Repository:** https://github.com/LayerZero-Labs/oapp-evm  
**Language:** Solidity  
**Key Concept:** Omnichain applications (OApps)

### What to Learn

1. **OApp Pattern**
   - How do you inherit from OApp?
   - How do you send messages across chains?
   - How do you receive messages?

2. **Message Format**
   - What's included in a LayerZero message?
   - How do you structure payload?
   - What are send/receive options?

3. **Security & Verification**
   - How does LayerZero verify messages?
   - What are oracle + relayer?
   - How can they fail?

### Code Sample

```solidity
// From oapp-evm
contract OApp is IOApp, Ownable {
    // Send a message to destination chain
    function _lzSend(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options
    ) internal {
        // How does this work?
    }
    
    // Receive a message from source chain
    function _lzReceive(
        address _oapp,
        uint32 _srcEid,
        bytes calldata _message
    ) internal virtual {
        // How is authenticity verified?
    }
}
```

**Key Insight:** LayerZero abstracts cross-chain complexity. Study their security model and understand potential failure modes.

---

## 4. Chainlink CCIP (Alternative Cross-Chain)

**Repository:** https://github.com/smartcontractkit/chainlink-ccip  
**Language:** Solidity  
**Key Concept:** More formal, compliance-first cross-chain messaging

### What to Learn

1. **CCIP Router**
   - How do you send messages via CCIP?
   - What's the message format?
   - What are risk management features?

2. **Fees & Gas**
   - How are fees calculated?
   - Premium for on-chain confirmation?
   - How does gas vary per chain?

3. **Security**
   - How does CCIP verify messages?
   - What are rate limits?
   - How do they prevent abuse?

### When to Use CCIP vs LayerZero

| Feature | LayerZero | CCIP |
|---------|-----------|------|
| Cost | Cheaper | More expensive |
| Speed | Faster | Slower (safer) |
| Security | Good | Very good |
| Maturity | Older, larger | Newer, formal |
| Best for | High volume | Conservative |

**Decision for Phase 1:** Use LayerZero (faster, cheaper). Have option to switch to CCIP if needed.

---

## 5. Across Protocol (Bridge Reference)

**Repository:** https://github.com/across-protocol/across-contracts  
**Language:** Solidity  
**Key Concept:** Intent-based bridging with relayers

### What to Learn

1. **Deposit Structure**
   - How do users request transfers?
   - What data is needed?
   - How are deposits identified?

2. **Relayer Model**
   - How do relayers fulfill deposits?
   - What incentives do they have?
   - How are they rewarded?

3. **Settlement**
   - How is settlement finalized?
   - How do they handle failures?
   - Timeout mechanism?

### Key Insight
Across proves that relayer-based intent settlement can work. Their economic model (relayers frontrun settlement) is worth studying.

---

## 6. Router Protocol (CCIF Reference)

**Repository:** https://github.com/router-resources/routerintentscookbook  
**Language:** Solidity  
**Key Concept:** Intent framework for L1/L2

### What to Learn

1. **Adapter Pattern**
   - How do adapters convert intents to actions?
   - How are adapters plugged in?
   - What's the interface?

2. **Intent Validation**
   - How do they validate intents?
   - What's the hashing scheme?
   - Nonce/replay protection?

3. **Execution**
   - How do intents get executed?
   - What's the flow vs settlement model?
   - Failure modes?

**Key Insight:** Router's adapter pattern could be useful for extensibility (Phase 2+).

---

## Comparison Matrix: Who Does What Best?

| Aspect | CoW | UniswapX | LayerZero | Across | Router |
|--------|-----|----------|-----------|--------|--------|
| **Intent Matching** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | N/A | ⭐⭐⭐ | ⭐⭐ |
| **Cross-Chain** | ❌ | ❌ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Solver Economics** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | N/A | ⭐⭐⭐⭐ | ⭐⭐ |
| **Code Clarity** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Scalability** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

---

## Your Design Decisions (Based on Research)

### Decision 1: Follow ERC-7683 Standard
- ✅ Benefit: Compatible with UniswapX, others
- ✅ Benefit: Clearer intent definition
- Use UniswapX as reference for encoding

### Decision 2: Use LayerZero for Cross-Chain
- ✅ Faster settlement (good UX)
- ✅ Lower fees
- ⚠️ Risk: If LayerZero fails, have CCIP fallback

### Decision 3: Solver Auction from CoW Protocol
- ✅ Proven model
- ✅ Competitive pricing
- ✅ Decentralized
- Copy CoW's fee mechanism

### Decision 4: P2P Matching (Custom)
- ❌ No existing protocol does cross-chain P2P matching
- Your innovation: Design matching engine from scratch
- Reference: CoW's batch auction logic

### Decision 5: Across-style Timeout & Refund
- ✅ Proven failure recovery
- User can refund if settlement takes too long
- Implement 5-minute timeout

---

## Code Reading Order

**Week 1: Understand Intent-Based Models**
1. Read CoW Protocol `GPv2Settlement.sol` (understand batch settlement)
2. Read UniswapX intent encoding (understand ERC-7683)
3. Sketch your intent format

**Week 2: Cross-Chain Mechanics**
1. Read LayerZero `OApp.sol` (understand message passing)
2. Read simple LayerZero example (e.g., OFT)
3. Design your cross-chain message format

**Week 3: Matching Engine**
1. Read CoW `GPv2Settlement.settle()` (batch matching)
2. Read Across relayer model
3. Design your P2P matching algorithm (pseudocode)

**Week 4: Solver Economics**
1. Read CoW's solver auction mechanism
2. Read UniswapX filler economics
3. Design your solver incentive model

---

## Key Questions to Answer

As you read each codebase, answer:

1. **Intentions**
   - What data defines an intent?
   - How is intent uniqueness guaranteed (hash)?
   - What are the invariants that must hold?

2. **Settlement**
   - What is the atomic operation (on-chain)?
   - What happens if it fails halfway?
   - How is failure recovered?

3. **Security**
   - How are signatures validated?
   - How is replay prevented?
   - What are the trust assumptions?

4. **Economics**
   - Who pays for what?
   - How are fees distributed?
   - What incentivizes good behavior?

5. **Scalability**
   - How many intents can be processed per block/second?
   - What's the bottleneck?
   - How would you scale further?

---

## Resources

- **ERC-7683:** https://eips.ethereum.org/EIPS/eip-7683
- **LayerZero Docs:** https://docs.layerzero.network/
- **Chainlink CCIP Docs:** https://docs.chain.link/ccip
- **CoW Protocol Docs:** https://docs.cow.fi/
- **Across Docs:** https://docs.across.to/

---

**Research Guide Version:** 1.0  
**Last Updated:** 2026-05-06  
**Status:** Ready to start deep dive