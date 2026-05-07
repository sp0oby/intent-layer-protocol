// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";

/// @notice Property and invariant tests for `IntentSettler`. These guard the
///         protocol's hard rules under fuzzed inputs and randomized call
///         sequences (no mocked oracles, no canned scripts).
/// @dev Stateful invariants run with `forge test --invariants` (default config).
contract IntentSettlerInvariantTest is Test {
    IntentSettler internal settler;
    ChainPeerRegistry internal registry;
    MockERC20 internal token;
    Handler internal handler;

    function setUp() public {
        vm.chainId(1);
        registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        MockLzEndpoint lz = new MockLzEndpoint();
        settler = new IntentSettler(address(registry), address(lz), address(this));
        lz.registerOApp(1, address(settler));
        token = new MockERC20("Mock", "MCK", 18);

        handler = new Handler(settler, token);
        // Tell the invariant fuzzer to only call into the handler.
        targetContract(address(handler));
    }

    // -----------------------------------------------------------------------
    // Invariants
    // -----------------------------------------------------------------------

    /// @notice The contract's ETH balance equals the sum of escrow held in
    ///         intents whose state still owes a refund/release.
    function invariant_ethEscrowAccounting() public view {
        uint256 expected = handler.expectedEthEscrow();
        assertEq(address(settler).balance, expected, "eth balance must equal outstanding escrow");
    }

    /// @notice The on-chain escrow ledger (`totalEthEscrow`) must equal the
    ///         handler's high-water expectation, AND the contract's ETH
    ///         balance must never drop below it. This is the core safety
    ///         invariant that guarantees user escrow is never debited for
    ///         operator fees, withdrawals, or any other path.
    function invariant_totalEthEscrowFloor() public view {
        uint256 expected = handler.expectedEthEscrow();
        assertEq(settler.totalEthEscrow(), expected, "ledger must match handler expectation");
        assertGe(address(settler).balance, settler.totalEthEscrow(), "balance must never dip below escrow floor");
    }

    /// @notice The contract's ERC-20 balance equals the sum of escrow held in
    ///         intents whose state still owes a refund/release.
    function invariant_erc20EscrowAccounting() public view {
        uint256 expected = handler.expectedErc20Escrow();
        assertEq(token.balanceOf(address(settler)), expected, "erc20 balance must equal outstanding escrow");
    }

    /// @notice No intent ever transitions backwards from a terminal state.
    function invariant_terminalStatesAreSticky() public view {
        bytes32[] memory hashes = handler.allHashes();
        for (uint256 i = 0; i < hashes.length; ++i) {
            bytes32 h = hashes[i];
            IIntentSettler.IntentState s = settler.intentStates(h);
            // Settled / Cancelled / Refunded never become Pending again.
            if (handler.wasTerminal(h)) {
                assertTrue(
                    s == IIntentSettler.IntentState.Cancelled || s == IIntentSettler.IntentState.Settled
                        || s == IIntentSettler.IntentState.Refunded,
                    "terminal state must remain terminal"
                );
            }
        }
    }

    /// @notice The `settled` flag is monotonic — once true, never false.
    /// @dev Combined with the state guards, this is the protocol's primary
    ///      defense against double-payout. The handler tracks the high-water
    ///      mark; the contract must never go below it.
    function invariant_settledFlagMonotonic() public view {
        bytes32[] memory hashes = handler.allHashes();
        for (uint256 i = 0; i < hashes.length; ++i) {
            bytes32 h = hashes[i];
            if (handler.wasSettled(h)) {
                assertTrue(settler.settled(h), "settled flag must stay true once set");
            }
        }
    }

    /// @notice Used nonces never reset. Once `usedNonces[user][nonce] = true`,
    ///         it stays true — guarantees no replay attacks even after cancel.
    function invariant_usedNoncesMonotonic() public view {
        // For each address+nonce the handler ever submitted, the contract's
        // mapping must still report it as used.
        uint256 count = handler.usedNonceCount();
        for (uint256 i = 0; i < count; ++i) {
            (address user, uint256 nonce) = handler.usedNonceAt(i);
            assertTrue(settler.usedNonces(user, nonce), "used nonce must stay used");
        }
    }

    // -----------------------------------------------------------------------
    // Property tests (single-call fuzzing)
    // -----------------------------------------------------------------------

    /// @notice For any pending intent, cancelling refunds exactly `sourceAmount`
    ///         to the user (or `refundTo` when set). Critical: no partial loss.
    function testFuzz_cancelAlwaysRefundsExactAmount(uint96 amount, uint64 nonce) public {
        vm.assume(amount > 0);
        address alice = address(0xA11CE);
        vm.deal(alice, uint256(amount));

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: amount,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 300,
            nonce: nonce
        });

        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: amount }(intent);
        uint256 balBefore = alice.balance;
        settler.cancelIntent(hash);
        vm.stopPrank();

        assertEq(alice.balance, balBefore + amount, "exact refund");
        assertEq(address(settler).balance, 0, "settler drained");
    }

    /// @notice executeMatching reverts cleanly for any local intent that isn't
    ///         in the right state. The remote intent is referenced only by
    ///         hash (price/token validation now lives on the destination).
    function testFuzz_executeMatchingNeverWorksOnUnknownLocal(bytes32 unknownHash, bytes32 remoteHash) public {
        vm.expectRevert(IntentSettler.LocalIntentNotOnThisChain.selector);
        settler.executeMatching(unknownHash, remoteHash);
    }

    /// @notice Same nonce can never be used twice by the same user, regardless
    ///         of the rest of the intent fields.
    function testFuzz_nonceReuseAlwaysReverts(uint96 amount1, uint96 amount2, uint64 nonce) public {
        vm.assume(amount1 > 0 && amount2 > 0);
        address alice = address(0xA11CE);
        vm.deal(alice, uint256(amount1) + uint256(amount2));

        IIntentSettler.Intent memory first = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: amount1,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 300,
            nonce: nonce
        });
        vm.prank(alice);
        settler.submitIntent{ value: amount1 }(first);

        IIntentSettler.Intent memory second = first;
        second.sourceAmount = amount2;
        vm.prank(alice);
        vm.expectRevert(IntentSettler.NonceAlreadyUsed.selector);
        settler.submitIntent{ value: amount2 }(second);
    }
}

// ---------------------------------------------------------------------------
// Handler — narrow surface for the invariant fuzzer.
// ---------------------------------------------------------------------------

/// @notice Stateful handler the Foundry invariant fuzzer randomly drives.
///         Tracks expected escrow as a ground truth for accounting invariants.
contract Handler is Test {
    IntentSettler public immutable settler;
    MockERC20 public immutable token;

    bytes32[] internal _hashes;
    mapping(bytes32 => uint256) internal _ethEscrowed;
    mapping(bytes32 => uint256) internal _erc20Escrowed;
    mapping(bytes32 => bool) internal _terminal;
    mapping(bytes32 => bool) internal _wasSettled;
    mapping(bytes32 => address) internal _user;
    mapping(bytes32 => uint256) internal _deadline;

    struct UsedNonce {
        address user;
        uint256 nonce;
    }

    UsedNonce[] internal _usedNonces;

    uint256 internal _ethEscrowSum;
    uint256 internal _erc20EscrowSum;
    uint64 internal _nonceCounter;

    constructor(IntentSettler s, MockERC20 t) {
        settler = s;
        token = t;
    }

    function allHashes() external view returns (bytes32[] memory) {
        return _hashes;
    }

    function expectedEthEscrow() external view returns (uint256) {
        return _ethEscrowSum;
    }

    function expectedErc20Escrow() external view returns (uint256) {
        return _erc20EscrowSum;
    }

    function wasTerminal(bytes32 hash) external view returns (bool) {
        return _terminal[hash];
    }

    function wasSettled(bytes32 hash) external view returns (bool) {
        return _wasSettled[hash];
    }

    function usedNonceCount() external view returns (uint256) {
        return _usedNonces.length;
    }

    function usedNonceAt(uint256 index) external view returns (address, uint256) {
        UsedNonce storage u = _usedNonces[index];
        return (u.user, u.nonce);
    }

    /// @notice Submit a fuzzed ETH intent.
    function submitEth(address user, uint96 amount) external {
        if (user == address(0) || user == address(this) || user == address(settler)) return;
        if (amount == 0) return;
        vm.deal(user, uint256(amount));

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: amount,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: user,
            refundTo: address(0),
            deadline: block.timestamp + 1 days,
            nonce: ++_nonceCounter
        });

        vm.prank(user);
        try settler.submitIntent{ value: amount }(intent) returns (bytes32 hash) {
            _hashes.push(hash);
            _ethEscrowed[hash] = amount;
            _ethEscrowSum += amount;
            _user[hash] = user;
            _deadline[hash] = intent.deadline;
            _usedNonces.push(UsedNonce({ user: user, nonce: intent.nonce }));
        } catch { }
    }

    /// @notice Submit a fuzzed ERC-20 intent.
    function submitErc20(address user, uint96 amount) external {
        if (user == address(0) || user == address(this) || user == address(settler)) return;
        if (amount == 0) return;

        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(settler), amount);

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(token),
            sourceAmount: amount,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: user,
            refundTo: address(0),
            deadline: block.timestamp + 1 days,
            nonce: ++_nonceCounter
        });

        vm.prank(user);
        try settler.submitIntent(intent) returns (bytes32 hash) {
            _hashes.push(hash);
            _erc20Escrowed[hash] = amount;
            _erc20EscrowSum += amount;
            _user[hash] = user;
            _deadline[hash] = intent.deadline;
            _usedNonces.push(UsedNonce({ user: user, nonce: intent.nonce }));
        } catch { }
    }

    /// @notice Cancel a previously submitted intent (random index from the
    ///         tracked set). Updates expected escrow accordingly.
    function cancel(uint256 idx) external {
        if (_hashes.length == 0) return;
        bytes32 hash = _hashes[idx % _hashes.length];
        if (_terminal[hash]) return;

        address user = _user[hash];
        vm.prank(user);
        try settler.cancelIntent(hash) {
            if (_ethEscrowed[hash] > 0) {
                _ethEscrowSum -= _ethEscrowed[hash];
                _ethEscrowed[hash] = 0;
            }
            if (_erc20Escrowed[hash] > 0) {
                _erc20EscrowSum -= _erc20Escrowed[hash];
                _erc20Escrowed[hash] = 0;
            }
            _terminal[hash] = true;
            _wasSettled[hash] = true;
        } catch { }
    }

    /// @notice Move time forward and let an arbitrary caller cancel an expired intent.
    function expireAndCancel(uint256 idx, address rando) external {
        if (_hashes.length == 0) return;
        if (rando == address(0)) return;
        bytes32 hash = _hashes[idx % _hashes.length];
        if (_terminal[hash]) return;

        vm.warp(_deadline[hash] + 1);
        vm.prank(rando);
        try settler.cancelIntent(hash) {
            if (_ethEscrowed[hash] > 0) {
                _ethEscrowSum -= _ethEscrowed[hash];
                _ethEscrowed[hash] = 0;
            }
            if (_erc20Escrowed[hash] > 0) {
                _erc20EscrowSum -= _erc20Escrowed[hash];
                _erc20Escrowed[hash] = 0;
            }
            _terminal[hash] = true;
            _wasSettled[hash] = true;
        } catch { }
    }
}
