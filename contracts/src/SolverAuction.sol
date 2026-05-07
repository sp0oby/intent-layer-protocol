// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ISolverAuction } from "./interfaces/ISolverAuction.sol";
import { SignatureValidator } from "./libraries/SignatureValidator.sol";

/// @title SolverAuction
/// @notice On-chain price-discovery auction for intents that did not find a
///         P2P match. Solvers submit signed proposals during a 30-second
///         window; the highest `proposedOutputAmount` wins.
/// @dev The auction is **decoupled from settlement**: the winning solver still
///      has to submit a regular counterparty intent on the destination chain,
///      which the off-chain matcher then pairs with the original intent via
///      `IntentSettler.executeMatching`. This contract's job is *only* to
///      record bids deterministically and identify the winner — it does not
///      itself trigger token movement.
contract SolverAuction is ISolverAuction {
    /// @notice Maximum proposals per intent. Defends against storage bloat /
    ///         DoS by spamming bogus proposals.
    uint256 public constant MAX_PROPOSALS_PER_INTENT = 50;

    /// @notice Domain mixed into the solver's signed digest. Bumping this
    ///         value invalidates every previously-signed proposal — change
    ///         only on intentional protocol-version migrations.
    /// @dev Stored as `bytes32` (not `string`) so `abi.encode` pads it as a
    ///      single 32-byte word instead of a length-prefixed dynamic field —
    ///      cheaper to hash and unambiguous on the off-chain side.
    bytes32 internal constant SIGNATURE_DOMAIN = bytes32("ILP-SolverProposal-v1");

    /// @notice The `IntentSettler` contract permitted to call
    ///         `setAuctionWindow`. `address(0)` keeps `setAuctionWindow`
    ///         permissionless for dev/tests (same pattern as
    ///         `IntentSettler.chainRegistry`).
    address public immutable intentSettler;

    /// @dev Layout: `solver` (20B) + `solverFeeBps` (uint16, 2B) share one slot.
    ///      `solverFeeBps` is in basis points (100 = 1%). uint16 holds 0–65535,
    ///      so the cap is 655.35% — far above any realistic solver fee.
    ///      Packing saves one SSTORE per `submitProposal` (~20k gas first-time).
    struct SolverProposal {
        address solver;
        uint16 solverFeeBps;
        uint256 proposedOutputAmount;
        bytes signature;
    }

    /// @notice Block timestamp by which proposals stop being accepted.
    mapping(bytes32 => uint256) public auctionCloseTime;

    /// @notice Once `executeWinningProposal` finalises an auction, the chosen
    ///         solver address is recorded here. `address(0)` means the
    ///         auction has not been finalised on-chain yet.
    mapping(bytes32 => address) public announcedWinner;

    /// @notice Once `executeWinningProposal` finalises, the chosen output
    ///         amount in destination-token units. Useful for off-chain
    ///         monitoring without re-running `selectWinner`.
    mapping(bytes32 => uint256) public announcedAmount;

    /// @notice All proposals ever submitted for an intent, in submission order.
    mapping(bytes32 => SolverProposal[]) internal _proposals;

    /// @notice Tracks whether a given solver already submitted for a given intent.
    mapping(bytes32 => mapping(address => bool)) internal _hasSubmitted;

    error AuctionAlreadyOpen();
    error AuctionNotOpen();
    error AuctionStillOpen();
    error TooManyProposals();
    error AlreadySubmitted();
    error ZeroOutput();
    error EmptyAuction();
    error NotIntentSettler();
    error InvalidSignature();
    error AlreadyAnnounced();

    event AuctionWindowSet(bytes32 indexed intentHash, uint256 closeTime);
    event ProposalSubmitted(bytes32 indexed intentHash, address indexed solver, uint256 proposedOutputAmount);
    event WinnerSelected(bytes32 indexed intentHash, address indexed solver, uint256 outputAmount);

    /// @param intentSettler_ Address of the `IntentSettler` permitted to open
    ///        auction windows. Pass `address(0)` in dev/tests for permissionless mode.
    constructor(address intentSettler_) {
        intentSettler = intentSettler_;
    }

    // -----------------------------------------------------------------------
    // Auction lifecycle
    // -----------------------------------------------------------------------

    /// @inheritdoc ISolverAuction
    /// @dev Closes Stage 1 audit finding M-03: setAuctionWindow is now gated
    ///      to the linked settler when one is configured.
    function setAuctionWindow(bytes32 intentHash, uint256 closeTime) external override {
        if (intentSettler != address(0) && msg.sender != intentSettler) revert NotIntentSettler();
        if (auctionCloseTime[intentHash] != 0) revert AuctionAlreadyOpen();
        if (closeTime <= block.timestamp) revert AuctionNotOpen();
        auctionCloseTime[intentHash] = closeTime;
        emit AuctionWindowSet(intentHash, closeTime);
    }

    /// @notice Submit a signed solver proposal. The signature is verified
    ///         against the canonical solver-proposal digest so a different
    ///         solver cannot impersonate someone else's bid.
    /// @dev Closes Stage 1 audit finding M-04. The digest binds the proposal
    ///      to this auction contract + chain + intent, preventing replay.
    function submitProposal(
        bytes32 intentHash,
        uint256 proposedOutputAmount,
        uint16 solverFeeBps,
        bytes calldata signature
    ) external {
        uint256 closeTime = auctionCloseTime[intentHash];
        if (closeTime == 0 || block.timestamp > closeTime) revert AuctionNotOpen();
        if (proposedOutputAmount == 0) revert ZeroOutput();
        if (_proposals[intentHash].length >= MAX_PROPOSALS_PER_INTENT) revert TooManyProposals();
        if (_hasSubmitted[intentHash][msg.sender]) revert AlreadySubmitted();

        bytes32 digest = proposalDigest(intentHash, proposedOutputAmount, solverFeeBps);
        if (!SignatureValidator.isValidSignature(msg.sender, digest, signature)) revert InvalidSignature();

        _hasSubmitted[intentHash][msg.sender] = true;
        _proposals[intentHash].push(
            SolverProposal({
                solver: msg.sender,
                solverFeeBps: solverFeeBps,
                proposedOutputAmount: proposedOutputAmount,
                signature: signature
            })
        );

        emit ProposalSubmitted(intentHash, msg.sender, proposedOutputAmount);
    }

    /// @notice Pure ranking. Reverts if the auction is still open or empty.
    function selectWinner(bytes32 intentHash) public view returns (address winner, uint256 winningAmount) {
        uint256 closeTime = auctionCloseTime[intentHash];
        if (closeTime == 0) revert AuctionNotOpen();
        if (block.timestamp <= closeTime) revert AuctionStillOpen();

        SolverProposal[] storage proposals = _proposals[intentHash];
        uint256 length = proposals.length;
        if (length == 0) revert EmptyAuction();

        for (uint256 i = 0; i < length;) {
            SolverProposal storage p = proposals[i];
            if (p.proposedOutputAmount > winningAmount) {
                winningAmount = p.proposedOutputAmount;
                winner = p.solver;
            }
            // Cap is `MAX_PROPOSALS_PER_INTENT = 50`, so `i` cannot overflow.
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Finalise the auction on-chain by recording the winner. Idempotent
    ///         on subsequent calls (returns the already-announced winner).
    /// @dev Permissionless: anyone (typically the matcher backend or the
    ///      winning solver themselves) can finalise. The off-chain matcher
    ///      uses the `WinnerSelected` event to coordinate the destination-side
    ///      counterparty intent.
    function executeWinningProposal(bytes32 intentHash) external returns (address winner, uint256 amount) {
        if (announcedWinner[intentHash] != address(0)) revert AlreadyAnnounced();

        (winner, amount) = selectWinner(intentHash);
        announcedWinner[intentHash] = winner;
        announcedAmount[intentHash] = amount;
        emit WinnerSelected(intentHash, winner, amount);
    }

    // -----------------------------------------------------------------------
    // Read helpers
    // -----------------------------------------------------------------------

    function proposalCount(bytes32 intentHash) external view returns (uint256) {
        return _proposals[intentHash].length;
    }

    function proposalAt(bytes32 intentHash, uint256 index) external view returns (SolverProposal memory) {
        return _proposals[intentHash][index];
    }

    /// @notice All proposals submitted for `intentHash`, in submission order.
    ///         Bounded by `MAX_PROPOSALS_PER_INTENT` (50) so the array is
    ///         always small enough to return safely in a single call.
    /// @dev    Frontend convenience: replaces N round-trips of
    ///         (`proposalCount` + N × `proposalAt`) with a single call.
    function getProposals(bytes32 intentHash) external view returns (SolverProposal[] memory) {
        return _proposals[intentHash];
    }

    /// @notice The exact 32-byte digest a solver must sign to submit a proposal.
    /// @dev Includes `address(this)` and `block.chainid` so a signature from
    ///      one auction or one chain cannot be replayed on another.
    function proposalDigest(bytes32 intentHash, uint256 proposedOutputAmount, uint16 solverFeeBps)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(SIGNATURE_DOMAIN, block.chainid, address(this), intentHash, proposedOutputAmount, solverFeeBps)
        );
    }
}
