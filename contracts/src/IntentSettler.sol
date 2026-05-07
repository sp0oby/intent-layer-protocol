// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { OApp, MessagingFee, MessagingReceipt, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

import { IChainPeerRegistry } from "./interfaces/IChainPeerRegistry.sol";
import { IIntentSettler } from "./interfaces/IIntentSettler.sol";
import { ISolverAuction } from "./interfaces/ISolverAuction.sol";
import { IntentHash } from "./libraries/IntentHash.sol";
import { SafeTransfer } from "./libraries/SafeTransfer.sol";

/// @title IntentSettler
/// @notice Phase 1 settler with full LayerZero V2 cross-chain wiring.
///         Same bytecode on every chain; the `IChainPeerRegistry` and OApp
///         `setPeer` mappings define which corridors are live.
/// @dev Cross-chain protocol (two-leg LayerZero):
///      1. Source chain `executeMatching` validates the local intent, sets
///         it to `Matched`, and sends `MSG_EXECUTE_MATCH` to the destination
///         chain via `_lzSend`. The source user (read from local storage,
///         trusted) is included in the payload as the dest-side recipient.
///      2. Dest chain `_lzReceive(EXECUTE_MATCH)` validates the local
///         intent, releases dest tokens to the source user, and sends
///         `MSG_CONFIRM` back carrying the dest user (read from local
///         storage, trusted) as the source-side recipient.
///      3. Source chain `_lzReceive(CONFIRM)` releases source tokens to
///         the dest user and transitions to `Settled`.
///
///      The CONFIRM payload is the only authority for who receives the
///      source tokens — there is no relayer-supplied recipient parameter,
///      so a malicious matcher cannot redirect funds.
///
///      If the destination LayerZero message fails to deliver, the source
///      user can call `refundIfLzTimeout` after `LZ_TIMEOUT` to recover.
contract IntentSettler is IIntentSettler, OApp, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 public constant AUCTION_DELAY = 30 seconds;
    uint256 public constant AUCTION_DURATION = 30 seconds;

    /// @notice Window after which a `Matched` intent can be self-refunded if
    ///         the LayerZero CONFIRM never returned. Set to **6 hours** to
    ///         minimise the asymmetric-loss race window: in the rare case
    ///         where EXECUTE_MATCH delivers to the destination (releasing
    ///         dest tokens) but CONFIRM fails to return, a tighter timeout
    ///         increases the risk that the refund fires before the
    ///         executor's manual-delivery retries can push CONFIRM through.
    ///         6 hours covers nearly every realistic LayerZero recovery
    ///         scenario while still being a tolerable user-facing wait.
    /// @dev Phase 2B may eliminate the asymmetric-loss class entirely via
    ///      HTLC or two-phase commit using the reserved `Locked` state.
    uint256 public constant LZ_TIMEOUT = 6 hours;

    /// @notice Cross-chain message version. Older peers reject unknown
    ///         versions cleanly; bump on payload-shape changes.
    uint8 internal constant MSG_VERSION = 1;

    /// @notice Cross-chain message type discriminators. The first byte
    ///         (after `abi.encode`) of every payload identifies the type.
    uint8 internal constant MSG_EXECUTE_MATCH = 1;
    uint8 internal constant MSG_CONFIRM = 2;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice Per-chain registry of LayerZero EIDs and supported route corridors.
    ///         `address(0)` is permitted in dev/tests to skip route validation.
    IChainPeerRegistry public immutable chainRegistry;

    /// @notice All recorded intents, keyed by their canonical EIP-712 hash.
    mapping(bytes32 => Intent) public intents;

    /// @notice Packed metadata: state + settled flag + three timestamps in a
    ///         single 32-byte slot. See `IntentMeta` natspec.
    mapping(bytes32 => IntentMeta) internal _meta;

    /// @notice Per-user nonce reuse guard.
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice The `SolverAuction` instance this settler delegates auction
    ///         windowing to. Settable post-deploy because the two contracts
    ///         hold each other's addresses (deploy IntentSettler first, then
    ///         deploy SolverAuction with the settler address, then call
    ///         `setSolverAuction` to close the loop). `address(0)` keeps
    ///         `openAuction` working in dev/test mode without an auction
    ///         contract.
    ISolverAuction public solverAuction;

    event SolverAuctionSet(address indexed solverAuction);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error WrongUser();
    error DeadlinePassed();
    error ZeroAmount();
    error WrongSourceChain();
    error RouteNotSupported();
    error NonceAlreadyUsed();
    error DuplicateIntent();
    error EthAmountMismatch();
    error EthNotAcceptedForErc20();
    error InvalidState();
    error NotAuthorizedToCancel();
    error AuctionDelayNotElapsed();
    error LocalIntentNotOnThisChain();
    error PriceConstraintViolated();
    error AlreadySettled();
    error LzTimeoutNotElapsed();
    error UnknownMessageType(uint8 msgType);
    error UnsupportedMessageVersion(uint8 version);
    error LzEidUnknownForChain(uint256 chainId);
    error InsufficientLzFee(uint256 sent, uint256 required);
    error WrongSourceEidForIntent(uint32 srcEid, uint32 expectedEid);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @param chainRegistry_ Address of the `ChainPeerRegistry` for this chain.
    ///        `address(0)` in dev/tests skips route validation.
    /// @param lzEndpoint_ LayerZero V2 endpoint address for this chain.
    /// @param delegate_ OApp delegate / Ownable owner. Use multisig in production.
    constructor(address chainRegistry_, address lzEndpoint_, address delegate_)
        OApp(lzEndpoint_, delegate_)
        Ownable(delegate_) // OAppCore inherits OZ v5 Ownable but doesn't pass initialOwner
        EIP712("IntentLayerProtocol", "1")
    {
        chainRegistry = IChainPeerRegistry(chainRegistry_);
    }

    // -----------------------------------------------------------------------
    // External: lifecycle
    // -----------------------------------------------------------------------

    /// @inheritdoc IIntentSettler
    function submitIntent(Intent calldata intent) external payable override nonReentrant returns (bytes32 intentHash) {
        if (intent.user != msg.sender) revert WrongUser();
        if (intent.deadline <= block.timestamp) revert DeadlinePassed();
        if (intent.sourceAmount == 0) revert ZeroAmount();
        if (intent.sourceChainId != block.chainid) revert WrongSourceChain();

        if (address(chainRegistry) != address(0)) {
            if (!chainRegistry.isRouteSupported(intent.sourceChainId, intent.destChainId)) {
                revert RouteNotSupported();
            }
        }

        if (usedNonces[intent.user][intent.nonce]) revert NonceAlreadyUsed();

        intentHash = _hashTypedDataV4(IntentHash.structHash(intent));
        if (_meta[intentHash].state != IntentState.None) revert DuplicateIntent();

        intents[intentHash] = intent;
        _meta[intentHash] = IntentMeta({
            state: IntentState.Pending,
            settled: false,
            submittedAt: uint64(block.timestamp),
            matchTimestamp: 0,
            auctionDeadline: 0
        });
        usedNonces[intent.user][intent.nonce] = true;

        if (intent.sourceToken == address(0)) {
            if (msg.value != intent.sourceAmount) revert EthAmountMismatch();
        } else {
            if (msg.value != 0) revert EthNotAcceptedForErc20();
            IERC20(intent.sourceToken).safeTransferFrom(msg.sender, address(this), intent.sourceAmount);
        }

        emit IntentSubmitted(intentHash, intent.user, intent);
    }

    /// @inheritdoc IIntentSettler
    function cancelIntent(bytes32 intentHash) external override nonReentrant {
        IntentMeta memory meta = _meta[intentHash];
        if (meta.state != IntentState.Pending && meta.state != IntentState.Auctioning) revert InvalidState();

        address user = intents[intentHash].user;
        address refundTo = intents[intentHash].refundTo;
        address sourceToken = intents[intentHash].sourceToken;
        uint256 sourceAmount = intents[intentHash].sourceAmount;

        bool authorized = msg.sender == user || block.timestamp >= intents[intentHash].deadline;
        if (!authorized) revert NotAuthorizedToCancel();

        meta.state = IntentState.Cancelled;
        meta.settled = true;
        _meta[intentHash] = meta;

        address recipient = refundTo == address(0) ? user : refundTo;
        _release(sourceToken, recipient, sourceAmount);

        emit IntentCancelled(intentHash);
        emit IntentRefunded(intentHash, recipient, sourceAmount);
    }

    /// @inheritdoc IIntentSettler
    /// @dev `msg.value` is forwarded to LayerZero as the message fee. The
    ///      caller (typically the matcher backend) must include enough native
    ///      currency for the destination delivery — quote via `quoteMatching`.
    function executeMatching(
        bytes32 localHash,
        bytes32 remoteHash,
        uint256 remoteSourceAmount,
        uint256 remoteMinDestAmount
    ) external payable override nonReentrant {
        IntentMeta memory meta = _meta[localHash];

        uint256 localSourceChainId = intents[localHash].sourceChainId;
        uint256 localDeadline = intents[localHash].deadline;
        uint256 localSourceAmount = intents[localHash].sourceAmount;
        uint256 localMinDestAmount = intents[localHash].minDestAmount;
        uint256 localDestChainId = intents[localHash].destChainId;
        address localUser = intents[localHash].user;

        if (localSourceChainId != block.chainid) revert LocalIntentNotOnThisChain();
        // Accept both Pending (P2P-matched directly) and Auctioning (a solver
        // won the auction and submitted a counterparty intent) — the auction
        // is a discovery layer, not a settlement lock. Whoever delivers a
        // valid counterpart first lands the trade.
        if (meta.state != IntentState.Pending && meta.state != IntentState.Auctioning) revert InvalidState();
        if (meta.settled) revert AlreadySettled();
        if (localDeadline <= block.timestamp) revert DeadlinePassed();
        if (localSourceAmount < remoteMinDestAmount) revert PriceConstraintViolated();
        if (remoteSourceAmount < localMinDestAmount) revert PriceConstraintViolated();

        meta.state = IntentState.Matched;
        meta.matchTimestamp = uint64(block.timestamp);
        _meta[localHash] = meta;

        emit IntentMatched(localHash, remoteHash);

        // Resolve destination LayerZero EID via the registry — never hardcoded.
        // `address(0)` registry is dev-only; production deploys require a real one.
        if (address(chainRegistry) == address(0)) revert LzEidUnknownForChain(localDestChainId);
        uint32 dstEid = chainRegistry.lzEidForChain(localDestChainId);
        if (dstEid == 0) revert LzEidUnknownForChain(localDestChainId);

        bytes memory payload = abi.encode(MSG_EXECUTE_MATCH, MSG_VERSION, localHash, remoteHash, localUser);

        // Forward msg.value as the LZ native fee. Empty options are fine for the
        // mock endpoint; production deploys will configure real executor options.
        _lzSend(dstEid, payload, "", MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 }), payable(msg.sender));
    }

    /// @notice Quote the native fee required for `executeMatching` to succeed.
    /// @dev Reads `localUser` from storage so the quoted payload byte-for-byte
    ///      matches what `executeMatching` will actually send. Callers must
    ///      attach at least this much `msg.value`; LayerZero refunds any excess.
    function quoteMatching(bytes32 localHash, bytes32 remoteHash) external view returns (MessagingFee memory) {
        uint256 destChainId = intents[localHash].destChainId;
        uint32 dstEid = chainRegistry.lzEidForChain(destChainId);
        address localUser = intents[localHash].user;
        bytes memory payload = abi.encode(MSG_EXECUTE_MATCH, MSG_VERSION, localHash, remoteHash, localUser);
        return _quote(dstEid, payload, "", false);
    }

    /// @inheritdoc IIntentSettler
    function openAuction(bytes32 intentHash) external override nonReentrant {
        IntentMeta memory meta = _meta[intentHash];
        if (meta.state != IntentState.Pending) revert InvalidState();
        if (block.timestamp < meta.submittedAt + AUCTION_DELAY) revert AuctionDelayNotElapsed();

        uint256 intentDeadline = intents[intentHash].deadline;
        if (intentDeadline <= block.timestamp) revert DeadlinePassed();

        uint256 deadline = block.timestamp + AUCTION_DURATION;
        if (deadline > intentDeadline) deadline = intentDeadline;

        meta.state = IntentState.Auctioning;
        meta.auctionDeadline = uint64(deadline);
        _meta[intentHash] = meta;

        emit AuctionOpened(intentHash, deadline);

        // Coordinate with the linked SolverAuction so solvers can start
        // submitting proposals immediately. Skipped in dev/test mode when no
        // auction contract is wired.
        if (address(solverAuction) != address(0)) {
            solverAuction.setAuctionWindow(intentHash, deadline);
        }
    }

    /// @notice Wire this settler to a `SolverAuction`. Called once after
    ///         deployment to break the constructor circular dependency.
    /// @dev Only the OApp delegate (`Ownable.owner`) can call this. Setting
    ///      to `address(0)` disables auction coordination — useful for tests.
    function setSolverAuction(address solverAuction_) external onlyOwner {
        solverAuction = ISolverAuction(solverAuction_);
        emit SolverAuctionSet(solverAuction_);
    }

    /// @inheritdoc IIntentSettler
    /// @dev Recover funds from a `Matched` intent whose LayerZero confirmation
    ///      never arrived. The 30-minute window is intentionally longer than
    ///      LayerZero's expected 3–5 minute settlement so users do not
    ///      receive spurious refunds during normal latency.
    function refundIfLzTimeout(bytes32 intentHash) external override nonReentrant {
        IntentMeta memory meta = _meta[intentHash];
        if (meta.state != IntentState.Matched) revert InvalidState();
        if (meta.settled) revert AlreadySettled();
        if (block.timestamp < uint256(meta.matchTimestamp) + LZ_TIMEOUT) revert LzTimeoutNotElapsed();

        address user = intents[intentHash].user;
        address refundTo = intents[intentHash].refundTo;
        address sourceToken = intents[intentHash].sourceToken;
        uint256 sourceAmount = intents[intentHash].sourceAmount;

        meta.state = IntentState.Refunded;
        meta.settled = true;
        _meta[intentHash] = meta;

        address recipient = refundTo == address(0) ? user : refundTo;
        _release(sourceToken, recipient, sourceAmount);

        emit IntentRefunded(intentHash, recipient, sourceAmount);
    }

    // -----------------------------------------------------------------------
    // OApp: cross-chain receive
    // -----------------------------------------------------------------------

    /// @notice Override the OApp `lzReceive` entry to add `nonReentrant`.
    /// @dev Defense in depth: the handlers release tokens, and a malicious
    ///      ETH recipient could try to re-enter via callbacks. The handlers'
    ///      effects-before-interactions ordering prevents accounting drift
    ///      regardless, but this guard makes any reentrancy fail loudly.
    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) public payable override nonReentrant {
        // Inline the parent's validation so we don't have to call super (which
        // would make the modifier ordering awkward).
        if (address(endpoint) != msg.sender) revert OnlyEndpoint(msg.sender);
        if (_getPeerOrRevert(_origin.srcEid) != _origin.sender) revert OnlyPeer(_origin.srcEid, _origin.sender);
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    /// @dev Dispatch on the message-type discriminator. Unknown types and
    ///      unsupported versions revert cleanly.
    function _lzReceive(
        Origin calldata _origin,
        bytes32, /*_guid*/
        bytes calldata _message,
        address, /*_executor*/
        bytes calldata /*_extraData*/
    )
        internal
        override
    {
        (uint8 msgType, uint8 version) = abi.decode(_message, (uint8, uint8));
        if (version != MSG_VERSION) revert UnsupportedMessageVersion(version);

        if (msgType == MSG_EXECUTE_MATCH) {
            _handleExecuteMatch(_origin, _message);
        } else if (msgType == MSG_CONFIRM) {
            _handleConfirm(_message);
        } else {
            revert UnknownMessageType(msgType);
        }
    }

    /// @dev Destination-chain handler. Releases local escrow to the source
    ///      user and sends a CONFIRM back so the source chain can settle.
    function _handleExecuteMatch(Origin calldata _origin, bytes calldata _message) internal {
        (,, bytes32 sourceHash, bytes32 destHash, address sourceUser) =
            abi.decode(_message, (uint8, uint8, bytes32, bytes32, address));

        IntentMeta memory meta = _meta[destHash];
        if (meta.state != IntentState.Pending) revert InvalidState();
        if (meta.settled) revert AlreadySettled();
        if (intents[destHash].deadline <= block.timestamp) revert DeadlinePassed();

        // Defense-in-depth: enforce that the LayerZero source EID corresponds
        // to the chain the local intent was destined for. The OApp peer check
        // already proves the message came from a trusted contract; this check
        // additionally proves it came from the *right* trusted chain — matters
        // when more than one corridor is enabled (Phase 2+ multi-chain).
        uint32 expectedSrcEid = chainRegistry.lzEidForChain(intents[destHash].destChainId);
        if (expectedSrcEid != _origin.srcEid) revert WrongSourceEidForIntent(_origin.srcEid, expectedSrcEid);

        // Settle the local intent: state → Settled, release tokens to source user.
        address destToken = intents[destHash].sourceToken;
        uint256 destAmount = intents[destHash].sourceAmount;
        address destUser = intents[destHash].user;

        meta.state = IntentState.Settled;
        meta.settled = true;
        _meta[destHash] = meta;

        _release(destToken, sourceUser, destAmount);
        emit IntentSettled(destHash, sourceUser, destAmount);

        // Send CONFIRM back to the source chain. The dest user (read from our
        // own storage — trusted) is the recipient on the source side.
        bytes memory reply = abi.encode(MSG_CONFIRM, MSG_VERSION, sourceHash, destUser);
        MessagingFee memory fee = _quote(_origin.srcEid, reply, "", false);
        if (address(this).balance < fee.nativeFee) revert InsufficientLzFee(address(this).balance, fee.nativeFee);

        _lzSend(_origin.srcEid, reply, "", fee, payable(address(this)));
    }

    /// @dev Source-chain handler. Releases local escrow to the dest user
    ///      and finalises the matched intent as `Settled`.
    function _handleConfirm(bytes calldata _message) internal {
        (,, bytes32 sourceHash, address destUser) = abi.decode(_message, (uint8, uint8, bytes32, address));

        IntentMeta memory meta = _meta[sourceHash];
        if (meta.state != IntentState.Matched) revert InvalidState();
        if (meta.settled) revert AlreadySettled();

        address sourceToken = intents[sourceHash].sourceToken;
        uint256 sourceAmount = intents[sourceHash].sourceAmount;

        meta.state = IntentState.Settled;
        meta.settled = true;
        _meta[sourceHash] = meta;

        _release(sourceToken, destUser, sourceAmount);
        emit IntentSettled(sourceHash, destUser, sourceAmount);
    }

    // -----------------------------------------------------------------------
    // Backward-compatible getters
    // -----------------------------------------------------------------------

    function intentStates(bytes32 intentHash) external view returns (IntentState) {
        return _meta[intentHash].state;
    }

    function settled(bytes32 intentHash) external view returns (bool) {
        return _meta[intentHash].settled;
    }

    function submittedAt(bytes32 intentHash) external view returns (uint256) {
        return _meta[intentHash].submittedAt;
    }

    function matchTimestamps(bytes32 intentHash) external view returns (uint256) {
        return _meta[intentHash].matchTimestamp;
    }

    function auctionDeadlines(bytes32 intentHash) external view returns (uint256) {
        return _meta[intentHash].auctionDeadline;
    }

    function getMeta(bytes32 intentHash) external view returns (IntentMeta memory) {
        return _meta[intentHash];
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _release(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            SafeTransfer.safeTransferETH(payable(to), amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice Accept native ETH from `submitIntent`, LayerZero fee refunds,
    ///         and operator pre-funding (used to pay return-leg LZ fees in
    ///         `_handleExecuteMatch`). Bare transfers cannot mint state.
    receive() external payable { }

    /// @dev Override OAppSender's strict `msg.value == _nativeFee` check so
    ///      the return-leg `_lzSend` inside `_lzReceive` (where `msg.value == 0`)
    ///      can draw from the contract's pre-funded balance. The user-initiated
    ///      `executeMatching` path still goes through the strict equality check.
    function _payNative(uint256 _nativeFee) internal override returns (uint256) {
        if (msg.value == _nativeFee) return _nativeFee;
        if (msg.value == 0 && address(this).balance >= _nativeFee) return _nativeFee;
        revert NotEnoughNative(msg.value);
    }
}
