// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IIntentSettler
/// @notice Core intent lifecycle interface for Intent Layer Protocol Phase 1.
/// @dev Same struct + state machine on every chain. `sourceChainId` distinguishes
///      "this chain" intents from cross-chain references in `executeMatching`.
interface IIntentSettler {
    /// @notice Cross-chain swap intent. ERC-7683-aligned struct (with `refundTo` for
    ///         future-proof refund routing). Native ETH is encoded as `address(0)`
    ///         for `sourceToken` / `destToken`.
    /// @dev Hashed via EIP-712 — see `libraries/IntentHash.sol`. The hash is the
    ///      canonical identifier and is computed deterministically off-chain
    ///      (MetaMask `eth_signTypedData_v4`) and on-chain.
    struct Intent {
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        address user;
        address refundTo; // address(0) defaults to `user` at refund time
        uint256 deadline;
        uint256 nonce;
    }

    /// @notice Intent lifecycle states.
    /// @dev Phase 1 settlement is **atomic** — destination-side `_handleExecuteMatch`
    ///      and source-side `_handleConfirm` validate, mark `Settled`, and
    ///      release tokens in the same transaction. There is no observable
    ///      window between "committed" and "released," so the `Locked` value
    ///      is **reserved for future async-settlement designs** (HTLC,
    ///      optimistic settlement, escrow review windows in Phase 2B). It is
    ///      kept in the enum at its current index so the on-chain ABI does
    ///      not break if a later version starts using it.
    ///
    ///      Phase 1 paths visit:  None → Pending → (Matched | Auctioning) → Settled.
    ///      Cancelled / Refunded are terminal off-path states.
    enum IntentState {
        None,
        Pending,
        Matched,
        Auctioning,
        Locked, // RESERVED — see natspec
        Settled,
        Cancelled,
        Refunded
    }

    /// @notice Packed per-intent metadata stored in **one** storage slot.
    /// @dev Layout (26 bytes used of 32):
    ///      - state           (uint8 enum, 1 byte)
    ///      - settled         (bool, 1 byte) — terminal-payout guard
    ///      - submittedAt     (uint64, 8 bytes) — `submitIntent` block timestamp
    ///      - matchTimestamp  (uint64, 8 bytes) — `executeMatching` block timestamp
    ///      - auctionDeadline (uint64, 8 bytes) — set by `openAuction`, capped at intent.deadline
    ///
    ///      `uint64` for timestamps is safe until year 2554 (2^64 / 31_536_000 / 60 ≈ year 2554).
    ///      Packing 5 fields into 1 slot saves ~80k gas per submit and ~20k per state
    ///      transition vs. five separate `mapping(bytes32 => …)` slots.
    struct IntentMeta {
        IntentState state;
        bool settled;
        uint64 submittedAt;
        uint64 matchTimestamp;
        uint64 auctionDeadline;
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /// @notice Emitted when a user submits a new intent and tokens are escrowed.
    event IntentSubmitted(bytes32 indexed intentHash, address indexed user, Intent intent);

    /// @notice Emitted when a Pending or Auctioning intent is cancelled and refunded.
    event IntentCancelled(bytes32 indexed intentHash);

    /// @notice Emitted when an intent transitions to Matched. Both hashes refer to
    ///         the matched pair across chains; the LayerZero send is triggered next.
    event IntentMatched(bytes32 indexed localHash, bytes32 indexed remoteHash);

    /// @notice Emitted when an intent transitions to Auctioning (no P2P match found).
    event AuctionOpened(bytes32 indexed intentHash, uint256 auctionDeadline);

    /// @notice Emitted when LayerZero confirms the cross-chain side has locked.
    event IntentLocked(bytes32 indexed intentHash);

    /// @notice Emitted when settlement completes and tokens are released.
    event IntentSettled(bytes32 indexed intentHash, address indexed recipient, uint256 amount);

    /// @notice Emitted when a stuck intent is refunded after LayerZero timeout.
    event IntentRefunded(bytes32 indexed intentHash, address indexed recipient, uint256 amount);

    // -----------------------------------------------------------------------
    // Functions
    // -----------------------------------------------------------------------

    /// @notice Submit an intent and escrow `sourceAmount` of `sourceToken`.
    /// @dev If `sourceToken == address(0)`, `msg.value` MUST equal `sourceAmount`.
    ///      Otherwise `msg.value` MUST be zero and the contract pulls via `safeTransferFrom`.
    function submitIntent(Intent calldata intent) external payable returns (bytes32 intentHash);

    /// @notice Cancel a Pending or Auctioning intent and refund the escrow.
    /// @dev Callable by `intent.user` at any time, or by anyone after `intent.deadline`.
    function cancelIntent(bytes32 intentHash) external;

    /// @notice Trigger P2P matching for the local intent (`localHash` must have
    ///         `sourceChainId == block.chainid`). The remote intent is a cross-chain
    ///         reference validated by the LayerZero delivery on the destination chain.
    /// @dev Permissionless. Callers (typically the matcher backend) forward LayerZero
    ///      fees in `msg.value`; the actual `_lzSend` is wired in Stage 2.
    function executeMatching(
        bytes32 localHash,
        bytes32 remoteHash,
        uint256 remoteSourceAmount,
        uint256 remoteMinDestAmount
    ) external payable;

    /// @notice Open the solver auction for an intent that did not find a P2P match.
    /// @dev Permissionless after `AUCTION_DELAY` (30s) since submission.
    function openAuction(bytes32 intentHash) external;

    /// @notice Refund an intent that became stuck after `executeMatching` because
    ///         the LayerZero message never delivered. Implemented in Stage 2.
    function refundIfLzTimeout(bytes32 intentHash) external;
}
