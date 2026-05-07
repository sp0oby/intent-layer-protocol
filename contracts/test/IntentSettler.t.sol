// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { IntentHash } from "../src/libraries/IntentHash.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockUSDT } from "./mocks/MockUSDT.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";

contract IntentSettlerTest is Test {
    ChainPeerRegistry internal registry;
    IntentSettler internal settler;
    MockLzEndpoint internal lz;
    MockERC20 internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        vm.chainId(1);
        registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        registry.setLzEidForChain(8453, 8453); // EID == chainId for tests
        lz = new MockLzEndpoint();
        settler = new IntentSettler(address(registry), address(lz), address(this));
        lz.registerOApp(1, address(settler));
        // Set a peer so executeMatching can send LZ messages without reverting on
        // OApp's `_getPeerOrRevert`. Most cancel/openAuction tests don't need it,
        // but executeMatching tests do — included here as a sane default.
        settler.setPeer(8453, bytes32(uint256(uint160(address(0xBA5E)))));
        token = new MockERC20("Mock", "MCK", 18);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _baseIntent(address user_, address sourceToken_, uint256 amount_, uint256 nonce_)
        internal
        view
        returns (IIntentSettler.Intent memory)
    {
        return IIntentSettler.Intent({
            sourceChainId: block.chainid,
            sourceToken: sourceToken_,
            sourceAmount: amount_,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 100e6,
            user: user_,
            refundTo: address(0),
            deadline: block.timestamp + 300,
            nonce: nonce_
        });
    }

    // -----------------------------------------------------------------------
    // submitIntent — escrow
    // -----------------------------------------------------------------------

    function testSubmitIntent_escrowsETH() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 0);
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Pending));
        assertEq(address(settler).balance, 1 ether);
        assertEq(settler.submittedAt(hash), block.timestamp);
        assertTrue(settler.usedNonces(alice, 0));
    }

    function testSubmitIntent_escrowsERC20() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(token), 1000e18, 1);
        token.mint(alice, 1000e18);

        vm.startPrank(alice);
        token.approve(address(settler), 1000e18);
        bytes32 hash = settler.submitIntent(intent);
        vm.stopPrank();

        assertEq(token.balanceOf(address(settler)), 1000e18);
        assertEq(token.balanceOf(alice), 0);
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Pending));
    }

    function testSubmitIntent_escrowsUSDTLikeNonBoolReturn() public {
        MockUSDT usdt = new MockUSDT();
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(usdt), 100e6, 2);
        usdt.mint(alice, 100e6);

        vm.startPrank(alice);
        usdt.approve(address(settler), 100e6);
        bytes32 hash = settler.submitIntent(intent);
        vm.stopPrank();

        assertEq(usdt.balanceOf(address(settler)), 100e6);
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Pending));
    }

    function testSubmitIntent_revertsIfMsgValueWrongForETH() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 3);
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        vm.expectRevert(IntentSettler.EthAmountMismatch.selector);
        settler.submitIntent{ value: 0.5 ether }(intent);
    }

    function testSubmitIntent_revertsIfMsgValueSentForERC20() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(token), 1000e18, 4);
        token.mint(alice, 1000e18);
        vm.deal(alice, 1 ether);

        vm.startPrank(alice);
        token.approve(address(settler), 1000e18);
        vm.expectRevert(IntentSettler.EthNotAcceptedForErc20.selector);
        settler.submitIntent{ value: 1 }(intent);
        vm.stopPrank();
    }

    function testSubmitIntent_revertsIfNonceReused() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 5);
        vm.deal(alice, 5 ether);

        vm.startPrank(alice);
        settler.submitIntent{ value: 1 ether }(intent);

        // Same nonce, different fields → different hash, but nonce already used.
        IIntentSettler.Intent memory dup = _baseIntent(alice, address(0), 2 ether, 5);
        vm.expectRevert(IntentSettler.NonceAlreadyUsed.selector);
        settler.submitIntent{ value: 2 ether }(dup);
        vm.stopPrank();
    }

    function testSubmitIntent_revertsWrongUser() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 6);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        vm.expectRevert(IntentSettler.WrongUser.selector);
        settler.submitIntent{ value: 1 ether }(intent);
    }

    function testSubmitIntent_revertsZeroAmount() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 0, 7);
        vm.prank(alice);
        vm.expectRevert(IntentSettler.ZeroAmount.selector);
        settler.submitIntent(intent);
    }

    function testSubmitIntent_revertsDeadlinePassed() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 8);
        intent.deadline = block.timestamp;
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(IntentSettler.DeadlinePassed.selector);
        settler.submitIntent{ value: 1 ether }(intent);
    }

    function testSubmitIntent_revertsWrongSourceChain() public {
        vm.chainId(8453);
        ChainPeerRegistry r = new ChainPeerRegistry(address(this));
        r.setRouteSupported(8453, 1, true);
        MockLzEndpoint lz2 = new MockLzEndpoint();
        IntentSettler s = new IntentSettler(address(r), address(lz2), address(this));
        lz2.registerOApp(8453, address(s));

        IIntentSettler.Intent memory intent = _baseIntent(bob, address(0), 1 ether, 9);
        intent.sourceChainId = 1; // mismatch with vm.chainid(8453)
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        vm.expectRevert(IntentSettler.WrongSourceChain.selector);
        s.submitIntent{ value: 1 ether }(intent);
    }

    function testSubmitIntent_revertsUnsupportedRoute() public {
        registry.setRouteSupported(1, 8453, false);
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 10);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert(IntentSettler.RouteNotSupported.selector);
        settler.submitIntent{ value: 1 ether }(intent);
    }

    function testSubmitIntent_noRegistry_skipsRouteCheck() public {
        MockLzEndpoint lz3 = new MockLzEndpoint();
        IntentSettler loose = new IntentSettler(address(0), address(lz3), address(this));
        lz3.registerOApp(1, address(loose));
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1, 11);
        intent.destChainId = 999_999;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        loose.submitIntent{ value: 1 }(intent);
        // Should not revert.
    }

    function testSubmitIntent_revertsDuplicate() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 12);
        vm.deal(alice, 5 ether);
        vm.startPrank(alice);
        settler.submitIntent{ value: 1 ether }(intent);

        // Re-submitting after unmarking the nonce would still fail on duplicate hash.
        // Direct re-submission also covered by NonceAlreadyUsed (already tested).
        vm.expectRevert(IntentSettler.NonceAlreadyUsed.selector);
        settler.submitIntent{ value: 1 ether }(intent);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // cancelIntent
    // -----------------------------------------------------------------------

    function testCancel_byUser_refundsETH() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 20);
        vm.deal(alice, 5 ether);

        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);
        uint256 balBefore = alice.balance;
        settler.cancelIntent(hash);
        vm.stopPrank();

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Cancelled));
        assertEq(alice.balance, balBefore + 1 ether);
        assertTrue(settler.settled(hash));
    }

    function testCancel_byUser_refundsERC20() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(token), 1000e18, 21);
        token.mint(alice, 1000e18);

        vm.startPrank(alice);
        token.approve(address(settler), 1000e18);
        bytes32 hash = settler.submitIntent(intent);
        settler.cancelIntent(hash);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 1000e18);
        assertEq(token.balanceOf(address(settler)), 0);
    }

    function testCancel_byAnyone_afterDeadline() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 22);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.warp(block.timestamp + 301);
        uint256 aliceBalBefore = alice.balance;
        vm.prank(bob);
        settler.cancelIntent(hash);

        assertEq(alice.balance, aliceBalBefore + 1 ether, "alice refunded");
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Cancelled));
    }

    function testCancel_byNonUserBeforeDeadline_reverts() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 23);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.prank(bob);
        vm.expectRevert(IntentSettler.NotAuthorizedToCancel.selector);
        settler.cancelIntent(hash);
    }

    function testCancel_routesToRefundTo_whenSet() public {
        address sink = address(0xDEAD);
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 24);
        intent.refundTo = sink;
        vm.deal(alice, 5 ether);

        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);
        settler.cancelIntent(hash);
        vm.stopPrank();

        assertEq(sink.balance, 1 ether);
        assertEq(alice.balance, 4 ether, "alice did not receive refund");
    }

    function testCancel_revertsIfAlreadyMatched() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 27);
        intent.minDestAmount = 100e6;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        // Transition to Matched via executeMatching.
        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(0xBEEF)));
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Matched));

        // Cancel must revert — Matched is not in {Pending, Auctioning}.
        vm.prank(alice);
        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.cancelIntent(hash);
    }

    function testCancel_revertsIfNotPendingOrAuctioning() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 25);
        vm.deal(alice, 5 ether);
        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);
        settler.cancelIntent(hash);

        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.cancelIntent(hash);
        vm.stopPrank();
    }

    function testCancel_worksFromAuctioningState() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 26);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.warp(block.timestamp + 31);
        settler.openAuction(hash);
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Auctioning));

        vm.prank(alice);
        settler.cancelIntent(hash);
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Cancelled));
    }

    // -----------------------------------------------------------------------
    // openAuction
    // -----------------------------------------------------------------------

    function testOpenAuction_afterDelay() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 30);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.warp(block.timestamp + 30);
        settler.openAuction(hash);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Auctioning));
        assertGt(settler.auctionDeadlines(hash), 0);
    }

    function testOpenAuction_revertsTooEarly() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 31);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.expectRevert(IntentSettler.AuctionDelayNotElapsed.selector);
        settler.openAuction(hash);
    }

    function testOpenAuction_revertsIfNotPending() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 32);
        vm.deal(alice, 5 ether);
        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);
        settler.cancelIntent(hash);
        vm.stopPrank();

        vm.warp(block.timestamp + 30);
        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.openAuction(hash);
    }

    function testOpenAuction_revertsIfDeadlinePassed() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 33);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.warp(block.timestamp + 301);
        vm.expectRevert(IntentSettler.DeadlinePassed.selector);
        settler.openAuction(hash);
    }

    // -----------------------------------------------------------------------
    // executeMatching
    // -----------------------------------------------------------------------

    function testExecuteMatching_validMatch() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 40);
        intent.minDestAmount = 2400e6;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        // Source-side `executeMatching` is now a thin lifecycle gate — token
        // and amount validation against the remote intent happen on the
        // destination chain via the LZ payload (see `_handleExecuteMatch`
        // tests in IntentSettler.lz.t.sol).
        bytes32 remoteHash = bytes32(uint256(0xBEEF));
        settler.executeMatching{ value: 1 wei }(hash, remoteHash);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Matched));
        assertEq(settler.matchTimestamps(hash), block.timestamp);
    }

    function testExecuteMatching_revertsIfLocalIntentNotOnThisChain() public {
        // The settler stores intents only when the user submits them with
        // `sourceChainId == block.chainid`, so we cannot construct an intent
        // whose stored sourceChainId is wrong via submitIntent. Instead we
        // verify the guard fires when the hash is unknown (storage zero).
        bytes32 unknownHash = keccak256("nope");
        vm.expectRevert(IntentSettler.LocalIntentNotOnThisChain.selector);
        settler.executeMatching(unknownHash, bytes32(0));
    }

    function testExecuteMatching_revertsIfDeadlinePassed() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 42);
        intent.minDestAmount = 2400e6;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        vm.warp(block.timestamp + 301);
        vm.expectRevert(IntentSettler.DeadlinePassed.selector);
        settler.executeMatching(hash, bytes32(uint256(1)));
    }

    function testExecuteMatching_revertsIfAlreadyMatched() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 43);
        intent.minDestAmount = 2400e6;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(1)));
        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.executeMatching(hash, bytes32(uint256(2)));
    }

    function testRefundIfLzTimeout_revertsIfNotMatched() public {
        // unknown hash → state == None → not Matched → reverts
        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.refundIfLzTimeout(bytes32(uint256(1)));
    }

    function testRefundIfLzTimeout_revertsTooEarly() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 50);
        intent.minDestAmount = 100e6;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(0xBEEF)));
        vm.expectRevert(IntentSettler.LzTimeoutNotElapsed.selector);
        settler.refundIfLzTimeout(hash);
    }

    function testRefundIfLzTimeout_refundsAfterTimeout() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 51);
        intent.minDestAmount = 100e6;
        intent.deadline = block.timestamp + 1 days; // longer than LZ_TIMEOUT
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(0xBEEF)));
        uint256 aliceBalBefore = alice.balance;

        // LZ_TIMEOUT = 6 hours
        vm.warp(block.timestamp + 6 hours + 1);
        settler.refundIfLzTimeout(hash);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Refunded));
        assertEq(alice.balance, aliceBalBefore + 1 ether, "alice refunded");
        assertTrue(settler.settled(hash));
        assertEq(settler.totalEthEscrow(), 0, "escrow drained on refund");
    }

    function testRefundIfLzTimeout_revertsIfAlreadySettled() public {
        IIntentSettler.Intent memory intent = _baseIntent(alice, address(0), 1 ether, 52);
        intent.minDestAmount = 100e6;
        intent.deadline = block.timestamp + 1 days;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(0xBEEF)));
        vm.warp(block.timestamp + 6 hours + 1);
        settler.refundIfLzTimeout(hash);

        // Second call should revert (state is now Refunded, not Matched).
        vm.expectRevert(IntentSettler.InvalidState.selector);
        settler.refundIfLzTimeout(hash);
    }

    /// @notice Test contract must accept ETH refunds and the OApp's eventual
    ///         fee refunds during LZ-receive tests.
    receive() external payable { }
}
