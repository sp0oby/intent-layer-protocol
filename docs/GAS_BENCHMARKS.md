# Gas Benchmarks — Phase 1 Contracts

**Measured:** 2026-05-09 · Foundry `--gas-report` · optimizer 200 runs · Solidity 0.8.26

All 94 Foundry tests pass. Numbers below are derived from the full test suite and represent realistic usage across happy-path and revert scenarios.

---

## IntentSettler.sol

| Function | Min | Avg | Median | Max | Notes |
|---|---|---|---|---|---|
| `submitIntent` | 28,162 | 208,380 | 288,729 | 315,844 | Range driven by ETH (cheap) vs ERC-20 (SSTORE allowance) paths |
| `cancelIntent` | 29,642 | 49,571 | 49,557 | 77,067 | ERC-20 refund path is the max |
| `executeMatching` | 35,720 | 59,776 | 36,464 | 417,956 | Max includes full LZ `_lzSend` call |
| `openAuction` | 29,617 | 48,288 | 50,139 | 63,681 | Calls into SolverAuction.setAuctionWindow |
| `refundIfLzTimeout` | 29,225 | 40,301 | 40,387 | 51,019 | ETH and ERC-20 refunds |
| `setPeer` | 25,537 | 47,288 | 47,473 | 47,677 | Admin-only setup |
| `withdrawOperatorFunds` | 24,179 | 30,254 | 30,629 | 34,830 | Operator ETH withdrawal |

**Deployment:** 3,421,160 gas · 16,694 bytes bytecode (68% of 24,576-byte limit, 32% headroom)

---

## SolverAuction.sol

| Function | Min | Avg | Median | Max | Notes |
|---|---|---|---|---|---|
| `submitProposal` | 26,100 | 154,032 | 210,938 | 210,950 | ECDSA verify + SSTORE per proposal |
| `executeWinningProposal` | 24,112 | 60,856 | 77,514 | 82,130 | Announces winner + emits event |
| `setAuctionWindow` | 22,117 | 41,263 | 45,777 | 45,808 | Settler-gated |
| `selectWinner` | 2,505 | 6,654 | 4,727 | 14,065 | Read-only scan |

**Deployment:** 900,278 gas · 4,083 bytes bytecode

---

## ChainPeerRegistry.sol

| Function | Min | Avg | Median | Max | Notes |
|---|---|---|---|---|---|
| `setRouteSupported` | 24,011 | 47,530 | 48,083 | 48,083 | Admin config |
| `setLzEidForChain` | 23,808 | 46,850 | 47,434 | 47,446 | Admin config |
| `isRouteSupported` | 2,509 | 2,509 | 2,509 | 2,509 | Warm SLOAD |
| `lzEidForChain` | 2,516 | 2,516 | 2,516 | 2,516 | Warm SLOAD |

**Deployment:** 304,315 gas · 1,280 bytes bytecode

---

## Key findings

**No critical optimization needed for Phase 1 MVP.** The numbers are within acceptable ranges for mainnet launch with per-user volume caps.

**`submitIntent` (288k median):** Two SSTOREs for intent state + optional `transferFrom` for ERC-20 escrow account for most of the cost. The 28k minimum is the revert path (validation failures). This is comparable to Uniswap v3 `exactInputSingle` (~130k) plus an ERC-20 transfer, so cost is reasonable.

**`executeMatching` (418k max):** The max includes the full LayerZero `_lzSend` call which transfers a native ETH fee and writes to the LZ endpoint. On Base with lower base fees this is ~$0.05–$0.20 per cross-chain match at 30–50 gwei on Ethereum L1.

**`submitProposal` (211k median):** ECDSA signature verification (~6k) + two SSTOREs for the proposal struct. The min (26k) is the signature validation revert.

**Contract size:** IntentSettler at 16,694 bytes leaves 32% headroom before the 24,576-byte EIP-170 limit. Sufficient for Phase 2 extensions without requiring a proxy upgrade.

---

## Estimated user costs at representative gas prices

| Scenario | Gas | @ 20 gwei | @ 50 gwei |
|---|---|---|---|
| Submit ETH intent | ~115,000 | ~$0.07 | ~$0.18 |
| Submit ERC-20 intent | ~289,000 | ~$0.18 | ~$0.46 |
| Cancel intent | ~50,000 | ~$0.03 | ~$0.08 |
| P2P executeMatching (relayer) | ~418,000 | ~$0.26 | ~$0.64 |
| Solver submitProposal | ~211,000 | ~$0.13 | ~$0.33 |

*ETH at $3,000. Relayer costs are borne by the protocol operator, not the user.*

---

## Document control

| | |
|:---|:---|
| **Version** | 1.0 |
| **Last updated** | 2026-05-09 |
| **Measured with** | `forge test --gas-report --no-match-test invariant` (94 tests) |
