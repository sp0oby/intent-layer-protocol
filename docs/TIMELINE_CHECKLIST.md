# Timeline & Development Checklist

**Audience:** Maintainers and core contributors · **Version:** 1.0 · **Status:** Planning checklist — dates are indicative  
**See also:** [README](../README.md) · [MVP specification](MVP_SPECIFICATION.md) · [Risk analysis](RISK_ANALYSIS.md) · [Contributing](../CONTRIBUTING.md)

---

## Phase 1 timeline (~12 weeks)

Week 1-2 — Foundation & Contracts
- [x] Finalize intent data model and ERC-7683 compatibility (added `refundTo` for refund routing alignment)
- [ ] Deploy and configure **`ChainPeerRegistry`** on each devnet/testnet chain (EIDs + `setRouteSupported` for Phase 1 routes) — Stage 8
- [x] Implement `IntentSettler.sol` core functions: EIP-712 hashing, native-ETH + ERC-20 escrow (incl. USDT-style non-bool returns via OZ `SafeERC20`), `cancelIntent` (user / post-deadline / `refundTo`), `executeMatching` (state + price guards), `openAuction` (after `AUCTION_DELAY`), `ReentrancyGuard` + CEI throughout
- [x] Implement basic local tests (Foundry): 55 tests across `IntentSettler`, `SolverAuction`, `IntentHash` (EIP-712 parity), `ChainPeerRegistry`, `Integration`
- [x] Set up repo structure, CI skeleton (CI installs OZ + LayerZero on demand; vendored libs gitignored)

Week 3-4 — Cross-Chain & Matching
- [x] Implement LayerZero OApp integration (`_lzSend` in `executeMatching`; `_lzReceive` dispatching `EXECUTE_MATCH` + `CONFIRM`; `refundIfLzTimeout` recovery; cross-chain round-trip verified via `MockLzEndpoint`)
- [x] Implement IntentSettler.sol on a per-chain basis (same bytecode; deploy per chain, registry-driven EIDs and routes)
- [x] **Follow-up security pass** — closed R-16 (price/token validation now enforced on destination using trusted data; matcher cannot bypass `minDestAmount` / `destToken`), R-17 (CONFIRM-leg source-EID guard), R-18 (operator pre-fund segregated from user ETH escrow via `totalEthEscrow` ledger + `withdrawOperatorFunds`). 100/100 tests, Slither clean.
- [ ] Build Event Indexer prototype (TypeScript) — Stage 4
- [x] Start matching engine prototype (in-memory) — initial version exists in `backend/src/services/matching.ts`

Week 5-6 — Auction & Solvers
- [x] Implement SolverAuction.sol (on-chain auction with signed proposals, deterministic ranking, idempotent winner finalisation, settler-gated window)
- [x] Wire `IntentSettler` ↔ `SolverAuction` (`openAuction` propagates window; `executeMatching` accepts Auctioning state)
- [ ] Expose solver API (REST) for proposals — Stage 4
- [ ] Implement basic solver reference implementation (bot) — Stage 4
- [ ] Integrate solver auction flow into matching engine — Stage 4

Week 7 — Frontend MVP
- [ ] Implement React swap UI (Next.js) with MetaMask via wagmi — **Uniswap-style one-click minimal UX**
- [ ] Show intent lifecycle and links to tx explorers
- [ ] Connect frontend to backend API and test submission flow

Week 8 — Integration & Tests
- [ ] End-to-end integration tests (Foundry + backend + frontend)
- [ ] Load testing for matching engine (100 concurrent intents)
- [ ] Gas benchmarking and optimization

Week 9 — Hardening (budget-conscious)
- [ ] Internal code review, Slither runs, Foundry fuzzing, and security checklist
- [ ] Fix issues found in tests and tooling
- [ ] Package artifacts for a future external audit when budget and launch scope warrant it

Week 10 — Testnet Deployment
- [ ] Deploy contracts to Sepolia / Base testnet equivalents
- [ ] Run multi-solver staging environment
- [ ] Invite alpha users for closed beta

Week 11 — Monitoring & Iteration
- [ ] Monitor metrics (match rate, latency, settlement success)
- [ ] Respond to bugs and edge-cases
- [ ] Iterate UI and UX based on feedback

Week 12 — Limited Mainnet Launch
- [ ] Deploy to Ethereum mainnet + Base mainnet
- [ ] Limit daily volume & per-user caps
- [ ] 24/7 monitoring for first 72 hours
- [ ] Begin bounty program & community outreach

---

## Minimal Acceptance Checklist (Phase 1)

Smart Contracts
- [x] Intent submission works and escrows tokens (native ETH + ERC-20 incl. USDT-style)
- [x] Intent events emitted (indexer to consume — Stage 4)
- [x] P2P matching results in atomic cross-chain settlement (token + chain + both-sides amount enforced on destination)
- [x] Solver auction functions accept and select proposals (signed digest; deterministic ranking)
- [x] Timeouts/refunds work reliably (6 hr LZ_TIMEOUT, self-serve refundIfLzTimeout, escrow-floor invariant)

Backend
- [ ] Indexer indexes events reliably (100% of events)
- [ ] Matching engine finds correct opposite intents <5s
- [ ] Solver API exposes unmatched intents and accepts proposals
- [ ] Database schema enforces invariants (no duplicate matches)

Frontend
- [ ] User can submit intents via wallet (MetaMask)
- [ ] UI shows real-time intent status and explorer links
- [ ] User can cancel unmatched intents

Security & Reliability
- [ ] Unit & integration test coverage >= 90%
- [ ] Internal security review complete; external audit scheduled/budgeted before high-limit mainnet exposure
- [ ] Monitoring/alerts for LayerZero and settlement failures
- [ ] Insurance/fallback plan configured

Operations
- [ ] Beta user list (>50) and initial incentives ready
- [ ] Escalation plan for stuck funds
- [ ] Legal review completed for Phase 1

---

## Post-Launch (Phase 2 Early Tasks)
- [ ] Implement solver staking & reputation system
- [ ] Add more token pairs and chain endpoints (Solana planning)
- [ ] Implement encrypted-intents research & PoC
- [ ] Design token economics in detail and community distribution

---

## Document control

| | |
|:---|:---|
| **Version** | 1.1 |
| **Last updated** | 2026-05-07 |
| **Status** | Weeks 1-6 contract scope complete; Stage 4 (backend services) is the next milestone |
