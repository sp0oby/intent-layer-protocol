# Timeline & Development Checklist

## Phase 1 Timeline (12 weeks)

Week 1-2 — Foundation & Contracts
- [ ] Finalize intent data model and ERC-7683 compatibility
- [ ] Implement IntentSettler.sol (Ethereum) core functions
- [ ] Implement basic local tests (Foundry)
- [ ] Set up repo structure, CI skeleton

Week 3-4 — Cross-Chain & Matching
- [ ] Implement LayerZero OApp integration (send/receive helpers)
- [ ] Implement IntentSettler.sol (Base) core functions
- [ ] Build Event Indexer prototype (TypeScript)
- [ ] Start matching engine prototype (in-memory)

Week 5-6 — Auction & Solvers
- [ ] Implement SolverAuction.sol (on-chain auction skeleton)
- [ ] Expose solver API (REST) for proposals
- [ ] Implement basic solver reference implementation (bot)
- [ ] Integrate solver auction flow into matching engine

Week 7 — Frontend MVP
- [ ] Implement React swap UI (Next.js) with MetaMask via wagmi
- [ ] Show intent lifecycle and links to tx explorers
- [ ] Connect frontend to backend API and test submission flow

Week 8 — Integration & Tests
- [ ] End-to-end integration tests (Foundry + backend + frontend)
- [ ] Load testing for matching engine (100 concurrent intents)
- [ ] Gas benchmarking and optimization

Week 9 — Audit & Hardening
- [ ] Internal code audit and security checklist
- [ ] Fix issues found in tests and audits
- [ ] Prepare audit artifacts for external firm

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
- [ ] Intent submission works and escrows tokens
- [ ] Intent events emitted and indexed
- [ ] P2P matching results in atomic cross-chain settlement
- [ ] Solver auction functions accept and select proposals
- [ ] Timeouts/refunds work reliably

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
- [ ] External audit completed with no critical findings
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

**Document Version:** 1.0
**Last Updated:** 2026-05-06
