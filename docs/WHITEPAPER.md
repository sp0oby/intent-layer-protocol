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

**Direct P2P matching across chains** — Existing cross-chain intent protocols (Across, UniswapX cross-chain, deBridge DLN, Mayan, Eco Routes) all use a solver/relayer as the counterparty. **Intent Layer Protocol attempts a P2P match first**, with a competitive solver auction as fallback. When a P2P match exists, the user gets CoW-style direct-swap pricing with no solver fee. When it doesn't, the user gets Across-style solver coverage. **We are the first to add the P2P-first matching layer to cross-chain intents** — we are NOT first to cross-chain intents as a category.

**Two-sided liquidity mining via `ILP`** — The bootstrap problem for any P2P market is "both sides need to show up at the same time." We solve it by rewarding **both counterparties** in a P2P match with `ILP` tokens. Solvers earn fees (their existing incentive); P2P-matched users earn rewards. This makes the protocol the highest-EV path for users with timing flexibility, driving up P2P match rate over time. (See Token Economics section.)

**Dead-Simple UX:** One-page interface, no bridge selection needed.

**Better Pricing:** Direct matching eliminates DEX slippage and removes the solver fee margin.

**Decentralized Solvers:** Easy solver SDK allows anyone to participate. Phase 2A bonded-solver model matches the production-proven Across architecture.

**MEV Transparency:** Clear incentive structures, no hidden extraction. Phase 2B encrypted intents add full pre-trade privacy.

### Why direct P2P matching matters

Solver-only intent protocols deliver convenience but concentrate three things — pricing power, censorship leverage, and capital — into the hands of a small set of professional market makers. P2P matching reverses each of those.

**Better pricing — structurally, not by promise.** When two opposite intents match directly, the trade settles at the price the two users agreed to. There is no solver inserting a margin between buy and sell. The user with `1 ETH → 2400 USDC min` and the user with `2400 USDC → 1 ETH min` can settle at exactly `1 ETH ↔ 2400 USDC` if both their thresholds are met. A solver-mediated equivalent would have charged a 5–30 bps spread between the two sides and pocketed the difference. Across this volume class, that spread is what makes intent protocols profitable for solvers — and it's what the P2P path eliminates entirely.

**More decentralized — at the participant level.** In a solver-only protocol, the "counterparty" role is gated by capital and infrastructure. Realistically, fewer than 20 entities globally are sophisticated enough to run a profitable cross-chain solver — they need RPC infrastructure, hot wallets on every chain, mempool tooling, and risk-management software. P2P matching makes any user with a wallet a potential counterparty. A retail user submitting `2400 USDC → 1 ETH` is just as valid a counterparty as a $50M-AUM market maker. The "anyone can be a counterparty" principle is the original blockchain ethos applied to cross-chain settlement.

**Censorship-resistant.** A small set of solvers is a small set of pressure points. If an OFAC-listed address tries to swap, every major solver — being a regulated market maker — will refuse to fill them. The same address with a legitimate counterparty intent can still match P2P, because the P2P match doesn't pass through any solver's compliance pipeline. (We do not endorse sanctions evasion; we observe that the architecture is censorship-resistant by construction, which matters for users in non-OFAC jurisdictions and for the long-term integrity of the system.)

**Capital efficient.** Solvers must lock capital on every chain they serve, sized to their largest expected fill. That capital sits idle most of the time. P2P matches require zero pre-funded capital from intermediaries — the two users' own escrows are the liquidity. The system scales cleanly with user count instead of solver capital, and we don't pay a solver markup for capital we didn't need.

**Anti-fragile.** If every solver in our auction goes offline tomorrow, P2P matching keeps working. Users with opposite intents continue to find each other. A protocol that can survive total solver failure on Day 1 is more robust than one that can't.

**This is why we put the P2P path first and the solver auction second**, not the other way around. Solver-mediated protocols (Across, UniswapX cross-chain, deBridge) are excellent at what they do — they're fast, reliable, and process billions in volume. We use that same model as our fallback. But we attempt the P2P match first because, when it works, it's strictly better for the user along every axis: price, decentralization, censorship resistance, and capital efficiency. The `ILP` two-sided liquidity-mining design (see Token Economics) is the bootstrap mechanism that drives P2P match rate up over time. The end-state ambition is a protocol where the majority of volume settles P2P, with bonded solvers picking up only the remainder that can't be matched directly.

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

### Intent Layer Protocol Token (`ILP`)

**Utility:**
- **Solver bonding** (Phase 2A) — collateral required to participate in solver auctions; slashable on undelivered fills
- **Two-sided P2P liquidity mining** (Phase 2B) — both counterparties in a P2P-matched intent earn `ILP`
- **Governance** (DAO control over `ChainPeerRegistry`, route allowlists, fee parameters)
- **Fee discounts** (10% reduction for stakers)

**Supply:**
- Total Supply: 100M `ILP`
- Distribution:
  - Team: 20% (4-year vesting)
  - Community / liquidity mining: 30% (P2P match rewards + airdrops)
  - Initial DEX liquidity: 15%
  - Treasury (grants, development): 35%

**Fee Structure:**
- Base fee: 0.10% (lower than bridges)
- Solver fee: 0.05% (variable, set by `solverFeeBps` in winning bid)
- Protocol fee: 0.05% (sent to treasury / token buyback)

**Example:**
- User swaps 100 USDC
- Base fee: $0.10
- Total cost: $0.10–0.15 (vs. $0.50–1.00 on current bridges)

### Two-sided P2P liquidity mining (Phase 2B)

The bootstrapping problem for any P2P matching protocol is "both sides need to show up at the same time." Solver-mediated protocols (Across, UniswapX) solve this by replacing the human counterparty with a market-maker — at the cost of a fee margin. We solve it by rewarding **both human counterparties** in a genuine P2P match with `ILP`.

**Mechanism:**
- When `executeMatching` settles a pair where neither side is a solver winner (i.e., both sides are independent users who happened to have opposite intents at the right time), the protocol mints `ILP` rewards to both `intent.user` addresses.
- Reward is proportional to volume but diminishes sharply above a per-day per-user threshold (so high rollers don't dominate emissions).
- Solver-mediated matches do **not** earn this reward — solvers earn `solverFeeBps` from the user instead.

**Why this is the right shape:**
- Makes P2P the highest-EV path for users with timing flexibility (a 30-second wait before auction opens becomes valuable, not just a UX delay)
- Drives up the long-term P2P match rate without distorting solver economics
- Solver-mediated path is preserved for impatient users and odd-pair-size matches

**Sybil resistance — the LooksRare lesson**

LooksRare launched two-sided rewards in 2022 and got immediately wash-traded — users round-tripping NFTs to themselves to farm tokens. Our design must reject this from day one:

| Mitigation | What it does |
|---|---|
| **Per-user daily volume cap** | Each `intent.user` address can earn rewards on at most $X/day of P2P-matched volume. Anti-whale + anti-Sybil. |
| **Counterparty distinctness check** | The matched pair's `user` addresses must differ. Self-trade detection: same address can't be both sides. |
| **Cooldown on rapid round-tripping** | If address A matches with address B, and within K minutes A submits an intent matching B again with reversed direction, the second match earns no reward. Prevents A↔B circular pairs. |
| **Minimum economic substance** | Reward only kicks in above a minimum match size (e.g., $50). Below that, it's gas-economically unfavorable to wash anyway, and we don't waste emissions on dust. |
| **Diminishing emissions curve** | Reward per match decreases as cumulative emissions rise. Aligns with typical liquidity-mining decay schedules — early adopters earn more, but the program self-throttles. |
| **Optional: address reputation tier** | New addresses earn at base rate; addresses with sustained legitimate activity earn at higher tier. Forces Sybil farms to age accounts before farming, raising attack cost. |
| **EIP-712 freshness** | Each rewarded match requires a fresh user signature (already enforced by our nonce + EIP-712 design). Replaying signed intents to farm rewards is structurally impossible. |

**Where the rewards come from:**
- 30% community allocation = 30M `ILP` over the program lifetime
- Decay schedule: 50% emitted in year 1, 30% in year 2, 20% over years 3–4
- Treasury can vote to top up if match rate is plateauing below target
- Fee revenue (the 0.05% protocol fee) buys back `ILP` and routes to the reward pool — so the program is self-sustaining once volume is established

**This is the same playbook that worked for CoW (solver incentives), Curve (LP incentives), and dYdX (trader incentives) — applied to cross-chain P2P matching for the first time.** The Sybil mitigations are deliberately conservative because LooksRare's launch is the cautionary case study every serious incentive design references.

---

## Roadmap

### Q2 2026: Phase 1 MVP
- Ethereum ↔ Base matching
- Simple P2P matching engine
- Basic solver auction (1-2 solvers)
- Web UI + MetaMask integration
- Testnet deployment
- **Target:** $100k daily volume

### Q3 2026: Phase 2A Expansion + Bonded Solvers
- Add Solana support (if chain integration feasible)
- More token pairs
- **Bonded solver model** — production-proven cross-chain settlement risk allocation
  - `SolverBondVault` contract: solvers stake ETH or `ILP` (when launched) before bidding
  - Slashing: failure to deliver within 30-min `DELIVERY_WINDOW` after winning
  - User experience: **always gets dest tokens** (solver eats any LZ-failure cost)
  - Same risk model as Across Protocol (~$15B+ cumulative volume since 2022 with zero user-funds-lost from settlement asymmetry) and Hop Protocol
- Mobile wallet support
- **Target:** $1M daily volume

### Q4 2026: Phase 2B Enhancement
- Encrypted intents (privacy layer) — uses the reserved `Locked` enum slot
- Intent chaining (multi-step intents)
- **Optional HTLC path** for zero-trust direct P2P swaps (no solver, no LZ in the atomicity path)
  - Production-proven via Lightning Network ($5B+ TVL since 2018), Atomex, Bisq
  - Tradeoffs: "free option" problem, more user transactions, but cryptographic atomicity
  - Coexists with the bonded-solver path — users choose
- More aggressive solver incentives (higher `MIN_BOND`, dynamic slashing, reputation tiers)
- Governance token launch (`ILP`)
- **Target:** $5M daily volume

### Q1 2027: Phase 3 Scaling
- 10+ chain support
- Advanced solver strategies
- Institutional features
- **Target:** $50M+ daily volume

---

## Competitive Landscape

Cross-chain intents are an established and competitive category in 2026. Several protocols process billions in volume on this exact problem. **We are not first to cross-chain intents** — we are an entrant with a specific differentiator (P2P matching as the primary path, with solver fallback) and a specific token-incentive structure (`ILP` rewards both sides of a P2P match).

| Protocol | Live since | Cumulative volume | Counterparty model | Cross-chain transport | Token incentives |
|---|---|---|---|---|---|
| **Across Protocol** | 2022 | $15B+ | Bonded relayer | Optimistic (UMA) | ACX |
| **UniswapX (cross-chain)** | 2024 | Growing | Filler / solver | Across-backed | Uniswap fee switch |
| **deBridge DLN** | 2023 | Billions | Solver | DLN relayers | DBR |
| **Mayan Finance** | 2023 | Hundreds of millions | Solver | Wormhole | None Phase 1 |
| **Eco Routes** | 2024 | Live | Solver | Various | None Phase 1 |
| **Bungee Exchange** | 2023 | Live | Aggregator | Multi-bridge | None |
| **1inch Fusion+** | 2024 | Live | Resolver | Various | 1INCH |
| **Garden Finance** | 2024 | Live | HTLC P2P-via-solver | HTLC | SEED |
| **CoW Protocol** | 2022 | $40B+ | Solver | **Single-chain only** | COW |
| **Intent Layer Protocol** (us) | Q2 2026 (target) | — | **P2P first, bonded solver fallback** | LayerZero V2 | **`ILP` to both P2P counterparties** |

### Where we genuinely differ

| Capability | Intent Layer Protocol | Existing protocols |
|---|---|---|
| **P2P matching across chains** | ✅ Primary path, attempted first for ~30s before auction | ❌ All existing protocols use solver/relayer/bonder as the counterparty |
| **Two-sided P2P liquidity mining** | ✅ Both users in a P2P match earn `ILP` (Phase 2B) | LooksRare-style on single-chain marketplaces; nothing equivalent for cross-chain intents |
| **ERC-7683 compatibility** | ✅ Aligned (with `refundTo` extension) | Across + UniswapX co-authored the standard |
| **Solver model when P2P fails** | ✅ Bonded solvers (Phase 2A) — same as Across | Across, Hop |
| **Encrypted intents** | Phase 2B (Noir-based, uses reserved `Locked` state) | None production yet |
| **Intent chaining** | Phase 2B | Planned by some, none live |

### What this means honestly

- We are entering a **competitive category** (cross-chain intents). Across has a 4-year head start and a $15B+ moat.
- Our **P2P-first matching layer** is a real innovation in the space — no production protocol does this for cross-chain.
- Our **token-incentive structure** (rewarding both sides of a P2P match) is a known-working bootstrapping pattern from CoW, LooksRare, dYdX, Curve, and others — applied for the first time to cross-chain P2P.
- Our **technical foundation** (LayerZero V2, ERC-7683 alignment, EIP-712, OZ contracts) is battle-tested. We are not betting on novel cryptography or untested infrastructure.
- The realistic Phase 1 P2P match rate is probably 15–40% in early days; the rest goes through bonded solvers (the same model Across uses). The `ILP` incentive is what pushes the long-term match rate higher.

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