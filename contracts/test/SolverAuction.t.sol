// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { SolverAuction } from "../src/SolverAuction.sol";

/// @notice Auction-only tests. The `intentSettler` is `address(0)` here so
///         `setAuctionWindow` is permissionless and we can drive the auction
///         lifecycle in isolation. Wired-settler integration tests live in
///         `IntentSettler.solver.t.sol`.
contract SolverAuctionTest is Test {
    SolverAuction internal auction;
    bytes32 internal constant INTENT_HASH = keccak256("intent");

    // Deterministic test keys: vm.addr(pk) → address; vm.sign(pk, digest) → sig.
    uint256 internal solverAPk = 0xA11CE;
    uint256 internal solverBPk = 0xB0B;
    address internal solverA;
    address internal solverB;

    function setUp() public {
        auction = new SolverAuction(address(0)); // dev/test: permissionless setAuctionWindow
        solverA = vm.addr(solverAPk);
        solverB = vm.addr(solverBPk);
    }

    function _openWindow(uint256 secondsAhead) internal returns (uint256 closeTime) {
        closeTime = block.timestamp + secondsAhead;
        auction.setAuctionWindow(INTENT_HASH, closeTime);
    }

    function _sign(uint256 pk, bytes32 intentHash, uint256 outputAmount, uint16 feeBps)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = auction.proposalDigest(intentHash, outputAmount, feeBps);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // -----------------------------------------------------------------------
    // setAuctionWindow
    // -----------------------------------------------------------------------

    function testSetAuctionWindow_storesCloseTime() public {
        uint256 close = _openWindow(60);
        assertEq(auction.auctionCloseTime(INTENT_HASH), close);
    }

    function testSetAuctionWindow_revertsIfAlreadyOpen() public {
        _openWindow(60);
        vm.expectRevert(SolverAuction.AuctionAlreadyOpen.selector);
        auction.setAuctionWindow(INTENT_HASH, block.timestamp + 120);
    }

    function testSetAuctionWindow_revertsIfCloseInPast() public {
        vm.warp(1000);
        vm.expectRevert(SolverAuction.AuctionNotOpen.selector);
        auction.setAuctionWindow(INTENT_HASH, 1000);
    }

    function testSetAuctionWindow_gatedToIntentSettler() public {
        // Deploy a fresh auction with a non-zero settler — only that address may open windows.
        address fakeSettler = address(0xDEAD);
        SolverAuction gated = new SolverAuction(fakeSettler);

        vm.expectRevert(SolverAuction.NotIntentSettler.selector);
        gated.setAuctionWindow(INTENT_HASH, block.timestamp + 60);

        vm.prank(fakeSettler);
        gated.setAuctionWindow(INTENT_HASH, block.timestamp + 60);
        assertEq(gated.auctionCloseTime(INTENT_HASH), block.timestamp + 60);
    }

    // -----------------------------------------------------------------------
    // submitProposal
    // -----------------------------------------------------------------------

    function testSubmitProposal_recordsSolverAddress() public {
        _openWindow(60);
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 2400e6, 30);

        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sig);

        assertEq(auction.proposalCount(INTENT_HASH), 1);
        SolverAuction.SolverProposal memory p = auction.proposalAt(INTENT_HASH, 0);
        assertEq(p.solver, solverA);
        assertEq(p.proposedOutputAmount, 2400e6);
        assertEq(p.solverFeeBps, 30);
    }

    function testSubmitProposal_revertsIfWindowClosed() public {
        _openWindow(60);
        vm.warp(block.timestamp + 61);
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 2400e6, 30);

        vm.prank(solverA);
        vm.expectRevert(SolverAuction.AuctionNotOpen.selector);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sig);
    }

    function testSubmitProposal_revertsIfNotOpened() public {
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        vm.expectRevert(SolverAuction.AuctionNotOpen.selector);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sig);
    }

    function testSubmitProposal_revertsZeroOutput() public {
        _openWindow(60);
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 0, 30);
        vm.prank(solverA);
        vm.expectRevert(SolverAuction.ZeroOutput.selector);
        auction.submitProposal(INTENT_HASH, 0, 30, sig);
    }

    function testSubmitProposal_revertsDoubleSubmit() public {
        _openWindow(60);
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 2400e6, 30);

        vm.startPrank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sig);

        bytes memory sig2 = _sign(solverAPk, INTENT_HASH, 2500e6, 30);
        vm.expectRevert(SolverAuction.AlreadySubmitted.selector);
        auction.submitProposal(INTENT_HASH, 2500e6, 30, sig2);
        vm.stopPrank();
    }

    function testSubmitProposal_revertsInvalidSignature() public {
        _openWindow(60);
        // Wrong signer: solverB signs but we submit as solverA.
        bytes memory wrongSig = _sign(solverBPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        vm.expectRevert(SolverAuction.InvalidSignature.selector);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, wrongSig);
    }

    function testSubmitProposal_revertsTamperedAmount() public {
        _openWindow(60);
        // solverA signs for 2400e6 but tries to submit 2500e6 — digest mismatches.
        bytes memory sig = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        vm.expectRevert(SolverAuction.InvalidSignature.selector);
        auction.submitProposal(INTENT_HASH, 2500e6, 30, sig);
    }

    function testProposalDigest_includesChainAndContract() public {
        bytes32 d1 = auction.proposalDigest(INTENT_HASH, 100, 30);

        // A different auction instance must produce a different digest for
        // the same logical proposal — prevents cross-contract replay.
        SolverAuction other = new SolverAuction(address(0));
        bytes32 d2 = other.proposalDigest(INTENT_HASH, 100, 30);
        assertTrue(d1 != d2, "digest must include address(this)");
    }

    // -----------------------------------------------------------------------
    // selectWinner / executeWinningProposal
    // -----------------------------------------------------------------------

    function testSelectWinner_picksHighestOutput() public {
        _openWindow(60);
        // Pre-compute signatures so vm.prank applies to submitProposal, not to
        // the internal proposalDigest call _sign makes.
        bytes memory sigA = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        bytes memory sigB = _sign(solverBPk, INTENT_HASH, 2450e6, 25);

        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sigA);
        vm.prank(solverB);
        auction.submitProposal(INTENT_HASH, 2450e6, 25, sigB);

        vm.warp(block.timestamp + 61);
        (address winner, uint256 amount) = auction.selectWinner(INTENT_HASH);
        assertEq(winner, solverB);
        assertEq(amount, 2450e6);
    }

    function testSelectWinner_revertsWhileOpen() public {
        _openWindow(60);
        bytes memory sigA = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sigA);
        vm.expectRevert(SolverAuction.AuctionStillOpen.selector);
        auction.selectWinner(INTENT_HASH);
    }

    function testSelectWinner_revertsIfEmpty() public {
        _openWindow(60);
        vm.warp(block.timestamp + 61);
        vm.expectRevert(SolverAuction.EmptyAuction.selector);
        auction.selectWinner(INTENT_HASH);
    }

    function testSelectWinner_revertsIfWindowNeverSet() public {
        vm.expectRevert(SolverAuction.AuctionNotOpen.selector);
        auction.selectWinner(INTENT_HASH);
    }

    function testExecuteWinningProposal_recordsAndEmits() public {
        _openWindow(60);
        bytes memory sigA = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        bytes memory sigB = _sign(solverBPk, INTENT_HASH, 2450e6, 25);

        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sigA);
        vm.prank(solverB);
        auction.submitProposal(INTENT_HASH, 2450e6, 25, sigB);

        vm.warp(block.timestamp + 61);
        (address winner, uint256 amount) = auction.executeWinningProposal(INTENT_HASH);
        assertEq(winner, solverB);
        assertEq(amount, 2450e6);

        assertEq(auction.announcedWinner(INTENT_HASH), solverB);
        assertEq(auction.announcedAmount(INTENT_HASH), 2450e6);
    }

    function testExecuteWinningProposal_revertsIfAlreadyAnnounced() public {
        _openWindow(60);
        bytes memory sigA = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sigA);

        vm.warp(block.timestamp + 61);
        auction.executeWinningProposal(INTENT_HASH);

        vm.expectRevert(SolverAuction.AlreadyAnnounced.selector);
        auction.executeWinningProposal(INTENT_HASH);
    }

    function testExecuteWinningProposal_revertsWhileOpen() public {
        _openWindow(60);
        bytes memory sigA = _sign(solverAPk, INTENT_HASH, 2400e6, 30);
        vm.prank(solverA);
        auction.submitProposal(INTENT_HASH, 2400e6, 30, sigA);
        // Auction still open → selectWinner internal call reverts.
        vm.expectRevert(SolverAuction.AuctionStillOpen.selector);
        auction.executeWinningProposal(INTENT_HASH);
    }
}
