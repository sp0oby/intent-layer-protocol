# Intent Layer Protocol — Whitepaper

**Audience:** Partners, contributors, investors · **Version:** 1.0 · **Status:** Living document (evolves with research and implementation)  
**See also:** [README](../README.md) · [Architecture](ARCHITECTURE.md) · [MVP specification](MVP_SPECIFICATION.md) · [Contributing](../CONTRIBUTING.md)

---

## Executive Summary

Intent Layer Protocol is a next-generation cross-chain liquidity protocol that simplifies multi-chain asset transfers through **intent-to-intent matching** and **intuitive user experience**. Instead of forcing users to manually select bridges and track slippage, users simply express their intent ("I want USDC on Base, funded with ETH on Ethereum") and the protocol handles optimal execution.

**Core Mission:** Make cross-chain transactions as simple as single-chain swaps.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Market Opportunity](#market-opportunity)
4. [Technical Architecture](#technical-architecture)
5. [Token Economics](#token-economics)
6. [Roadmap](#roadmap)
7. [Competitive Analysis](#competitive-analysis)
8. [Team](#team)

---

## Problem Statement

### Current Cross-Chain Pain Points

**1. Complex User Experience**
- Users must manually select bridges (Stargate, Across, Connext, etc.)
- No unified interface for comparing prices/speed/costs
- Multiple wallet approvals required
- High failure rates on complex routes

**2. Poor Pricing**
- Bridge slippage compounds with DEX slippage
- Users lose 2-5% on typical cross-chain swaps
- No mechanism for direct P2P matching across chains

**3. Fragmented Liquidity**
- Each chain has isolated liquidity pools
- Capital inefficiency (billions locked in bridges)
- Weak price discovery for cross-chain assets

**4. Long Settlement Times**
- Most bridges take 10+ minutes
- Finality uncertainty on destination chain
- Poor UX for time-sensitive trades

**5. Solver Centralization**
- Current intent systems (UniswapX, CoW) rely on few solvers
- High barrier to becoming a solver
- Potential MEV extraction without transparency

### Market Impact
- **Daily Cross-Chain Volume:** $2-3B (as of 2026)
- **Estimated Slippage Loss:** $200M-300M per day across all users
- **Growth:** +40% YoY as multi-chain becomes standard

---

## Solution Overview

### What is Intent Layer Protocol?

A **three-tier system** combining:

1. **Intent Expression Layer** - Simple, user-friendly interface
   - "I want X tokens on chain B, funded from chain A"
   - Automatic gas estimation and fee calculation
   - Support for conditional intents

2. **Intent Matching Engine** - Peer-to-peer settlement
   - Direct matching of opposite intents (User A ↔ User B across chains)
   - Atomic cross-chain settlement with no DEX required
   - Fallback to solver auction if no match found

3. **Solver Auction Layer** - Competitive execution
   - Decentralized solvers compete to fulfill unmatched intents
   - MEV-minimized settlement
   - Transparent fee discovery

### Key Differentiators

**Intent-to-Intent Matching:** First protocol to enable direct P2P cross-chain swaps (like CoW Protocol but across chains)

**Dead-Simple UX:** One-page interface, no bridge selection needed

**Better Pricing:** Direct matching eliminates DEX slippage

**Decentralized Solvers:** Easy solver SDK allows anyone to participate

**MEV Transparency:** Clear incentive structures, no hidden extraction

---

## Market Opportunity

### Total Addressable Market (TAM)

**Calculation:**
- Annual cross-chain volume: ~$1 trillion (2-3B daily × 365 days)
- Average fee: 0.15% (5bps current market + improved pricing)
- Market opportunity: **$1.5 billion annually**

### Serviceable Market (SAM)
- Focus on DeFi power users + retail onboarding
- **Year 1 target:** 5% market share = $75M in fees
- **Year 3 target:** 15% market share = $225M in fees

### Target Users
- **Segment 1:** DeFi power users ($10k+ per transaction)
- **Segment 2:** Institutional traders (volume arbitrage)
- **Segment 3:** Retail users (simpler UX than bridge aggregators)
- **Segment 4:** Gaming/NFT communities (cross-chain minting)

---

## Technical Architecture

### Phase 1 MVP: Ethereum ↔ Base Matching

```
┌─────────────────────────────────────────────┐
│ Intent Expression (Web UI)                  │
│ "100 USDC on Base ← funded with ETH on Eth" │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Intent Validation & Encoding                │
│ • Check balances, allowances                │
│ • Encode to ERC-7683 format                 │
│ • Estimate gas costs                        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Intent Matching Engine                      │
│ • Query intent order book                   │
│ • Find opposite intents (P2P)               │
│ • If match found → atomic settlement        │
│ • If no match → go to solver auction        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Solver Auction (if no match)                │
│ • Open auction for 30 seconds               │
│ • Solvers bid to fulfill intent             │
│ • Best solver executes on-chain             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Cross-Chain Settlement                      │
│ • LayerZero message to destination chain    │
│ • Atomic verify + execute                   │
│ • User receives tokens on destination       │
└─────────────────────────────────────────────┘
```

### Core Components

**0. Chain registry (on each chain)**  
Per-network [`ChainPeerRegistry`](../contracts/src/ChainPeerRegistry.sol): LayerZero **endpoint id** per `chainId` and **`isRouteSupported`** for gradual multi-chain rollout. Works with (does not replace) LayerZero **`setPeer`**.

**1. Intent Settlement Contract** (Ethereum)
- Receives intents from users
- Escrows tokens
- Triggers LayerZero messages to Base

**2. Intent Settlement Contract** (Base)
- Receives cross-chain messages
- Executes settlements on destination
- Releases tokens to recipients

**3. Intent Matching Engine** (Off-chain)
- Monitors intent order book
- Finds matching pairs
- Calls settlement contracts to execute

**4. Solver Auction** (On-chain, ERC-7683 compatible)
- Fallback for unmatched intents
- Solvers propose settlement solutions
- Best proposal wins

**5. Web UI/Wallet Integration**
- Simple intent entry form
- Real-time matching status
- Transaction history

---

## Token Economics

### Intent Layer Protocol Token (ILP)

**Utility:**
- Solver staking (collateral for execution)
- Governance (DAO control)
- Fee discounts (10% reduction for stakers)
- Incentives (liquidity mining)

**Supply:**
- Total Supply: 100M ILP
- Distribution:
  - Team: 20% (4-year vesting)
  - Community: 30% (airdrops, rewards)
  - Liquidity: 15% (initial DEX liquidity)
  - Treasury: 35% (grants, development)

**Fee Structure:**
- Base fee: 0.10% (lower than bridges)
- Solver fee: 0.05% (variable by market)
- Protocol fee: 0.05% (sent to treasury)

**Example:**
- User swaps 100 USDC
- Base fee: $0.10
- Total cost: $0.10-0.15 (vs. $0.50-1.00 on current bridges)

---

## Roadmap

### Q2 2026: Phase 1 MVP
- Ethereum ↔ Base matching
- Simple P2P matching engine
- Basic solver auction (1-2 solvers)
- Web UI + MetaMask integration
- Testnet deployment
- **Target:** $100k daily volume

### Q3 2026: Phase 2 Expansion
- Add Solana support (if chain integration feasible)
- More token pairs
- Improved solver competition
- Mobile wallet support
- **Target:** $1M daily volume

### Q4 2026: Phase 2B Enhancement
- Encrypted intents (privacy layer)
- Intent chaining (multi-step intents)
- More aggressive solver incentives
- Governance token launch
- **Target:** $5M daily volume

### Q1 2027: Phase 3 Scaling
- 10+ chain support
- Advanced solver strategies
- Institutional features
- **Target:** $50M+ daily volume

---

## Competitive Analysis

| Feature | Intent Layer Protocol | UniswapX | CoW Protocol | Across | LiFi |
|---------|----------------------|----------|--------------|--------|------|
| Cross-Chain P2P Matching | Yes | No | Single-chain | No | No |
| Simple UX | Yes | Good | Good | Okay | Okay |
| Decentralized Solvers | Yes (easy SDK) | Yes | Yes | Limited | No |
| Intent Chaining | Planned | No | No | No | No |
| Privacy Layer | Planned | No | No | No | No |
| ERC-7683 Compatible | Yes | Yes | Yes | Partial | No |

---

## Risks & Mitigations

### Technical Risks

**Risk:** Smart contract bugs in cross-chain settlement
- **Mitigation:** Multiple audits, gradual rollout, bug bounty program

**Risk:** LayerZero downtime affects settlement
- **Mitigation:** Fallback messaging layer, insurance pool

**Risk:** Solver centralization despite best efforts
- **Mitigation:** Solver incentive program, democratized SDK

### Market Risks

**Risk:** UniswapX/others improve and capture market
- **Mitigation:** First-mover advantage on P2P matching, community focus

**Risk:** Low adoption due to UX/network effects
- **Mitigation:** Strong marketing, partnerships with wallets/protocols

**Risk:** Regulatory scrutiny on bridges
- **Mitigation:** Conservative design, compliance-first approach

### Operational Risks

**Risk:** Team is small (solo founder initially)
- **Mitigation:** Hire key roles in Q2-Q3, focus on MVP quality

---

## Team

**Founder & Lead Developer:** @sp0oby
- Blockchain developer with expertise in cross-chain protocols
- Building Intent Layer Protocol solo initially
- Seeking co-founders in Q2 2026

---

## Conclusion

Intent Layer Protocol addresses a critical gap in cross-chain infrastructure by combining the best of CoW Protocol (solver auctions, intent matching) with cross-chain capabilities. By prioritizing simple UX and direct P2P matching, we believe we can capture meaningful market share and become the standard for cross-chain asset transfers.

---

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-06 |
| **Status** | Living document — revisions track product and market learning |
| **Feedback** | Open an issue or PR against this file for factual or strategic corrections |