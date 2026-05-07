// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { SolverAuction } from "../src/SolverAuction.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";
import {
    Origin,
    MessagingParams
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice Cross-chain LayerZero round-trip tests. Two `IntentSettler`
///         instances (one per chain) share a single `MockLzEndpoint`. The
///         mock queues each `_lzSend` call; tests trigger `deliverNext()` to
///         push the message to the destination's `lzReceive`.
/// @dev Verifies the full Phase 1 P2P happy path:
///         Source.executeMatching  →  EXECUTE_MATCH  →  Dest.lzReceive
///         (releases dest tokens, sends CONFIRM)
///         Dest.lzReceive          →  CONFIRM        →  Source.lzReceive
///         (releases source tokens, intent → Settled)
///      Plus failure paths: invalid peer, wrong message version, unknown
///      message type, dropped LZ delivery → `refundIfLzTimeout` recovery.
contract IntentSettlerLzTest is Test {
    // Chain layout: chainId == EID for clarity. EID 1 = Ethereum, EID 2 = Base.
    uint32 internal constant ETH_EID = 1;
    uint32 internal constant BASE_EID = 2;

    MockLzEndpoint internal lz;

    // Two separate registries (one per chain), each pointing at its own settler.
    ChainPeerRegistry internal ethRegistry;
    ChainPeerRegistry internal baseRegistry;

    IntentSettler internal ethSettler;
    IntentSettler internal baseSettler;

    MockERC20 internal usdc; // base-side token

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        lz = new MockLzEndpoint();

        // Deploy on "Ethereum" chain context first.
        vm.chainId(uint256(ETH_EID));
        ethRegistry = new ChainPeerRegistry(address(this));
        ethRegistry.setRouteSupported(uint256(ETH_EID), uint256(BASE_EID), true);
        ethRegistry.setLzEidForChain(uint256(BASE_EID), BASE_EID);
        ethSettler = new IntentSettler(address(ethRegistry), address(lz), address(this));
        lz.registerOApp(ETH_EID, address(ethSettler));

        // Switch to "Base" chain context for the second deploy. The settler's
        // `block.chainid == BASE_EID` requirement at submit time follows.
        vm.chainId(uint256(BASE_EID));
        baseRegistry = new ChainPeerRegistry(address(this));
        baseRegistry.setRouteSupported(uint256(BASE_EID), uint256(ETH_EID), true);
        baseRegistry.setLzEidForChain(uint256(ETH_EID), ETH_EID);
        baseSettler = new IntentSettler(address(baseRegistry), address(lz), address(this));
        lz.registerOApp(BASE_EID, address(baseSettler));

        // Wire peers bilaterally so each settler trusts messages from the other.
        ethSettler.setPeer(BASE_EID, _addrToBytes32(address(baseSettler)));
        baseSettler.setPeer(ETH_EID, _addrToBytes32(address(ethSettler)));

        // Pre-fund Base so it can pay LZ fees for the CONFIRM return message.
        // In production the operator pre-funds; for tests we top up directly.
        vm.deal(address(baseSettler), 10 wei);

        // Mint Base USDC for Bob.
        usdc = new MockERC20("USDC", "USDC", 6);
        usdc.mint(bob, 2400e6);
    }

    function _addrToBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function _aliceIntent(uint256 nonce_) internal view returns (IIntentSettler.Intent memory) {
        return IIntentSettler.Intent({
            sourceChainId: uint256(ETH_EID),
            sourceToken: address(0), // ETH
            sourceAmount: 1 ether,
            destChainId: uint256(BASE_EID),
            destToken: address(usdc),
            minDestAmount: 2400e6,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 1 days,
            nonce: nonce_
        });
    }

    function _bobIntent(uint256 nonce_) internal view returns (IIntentSettler.Intent memory) {
        return IIntentSettler.Intent({
            sourceChainId: uint256(BASE_EID),
            sourceToken: address(usdc),
            sourceAmount: 2400e6,
            destChainId: uint256(ETH_EID),
            destToken: address(0), // ETH
            minDestAmount: 1 ether,
            user: bob,
            refundTo: address(0),
            deadline: block.timestamp + 1 days,
            nonce: nonce_
        });
    }

    /// @notice Full happy path: Alice (ETH) ↔ Bob (USDC), end-to-end.
    function testLz_fullP2PRoundTrip() public {
        // ---- Submit on Ethereum ----
        vm.chainId(uint256(ETH_EID));
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 aliceHash = ethSettler.submitIntent{ value: 1 ether }(_aliceIntent(1));

        // ---- Submit on Base ----
        vm.chainId(uint256(BASE_EID));
        vm.startPrank(bob);
        usdc.approve(address(baseSettler), 2400e6);
        bytes32 bobHash = baseSettler.submitIntent(_bobIntent(1));
        vm.stopPrank();

        // Sanity: both intents Pending, escrow held by their respective settlers.
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Pending));
        assertEq(uint256(baseSettler.intentStates(bobHash)), uint256(IIntentSettler.IntentState.Pending));
        assertEq(address(ethSettler).balance, 1 ether);
        assertEq(usdc.balanceOf(address(baseSettler)), 2400e6);

        // ---- Match on Ethereum (source side) ----
        vm.chainId(uint256(ETH_EID));
        ethSettler.executeMatching{ value: 1 wei }(aliceHash, bobHash, 2400e6, 1 ether);
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Matched));
        assertEq(lz.pending(), 1, "EXECUTE_MATCH queued");

        // ---- Deliver EXECUTE_MATCH to Base ----
        vm.chainId(uint256(BASE_EID));
        lz.deliverNext();

        // Base settled: Bob's intent → Settled, USDC released to Alice on Base.
        assertEq(uint256(baseSettler.intentStates(bobHash)), uint256(IIntentSettler.IntentState.Settled));
        assertEq(usdc.balanceOf(alice), 2400e6, "alice received USDC on Base");
        assertEq(usdc.balanceOf(address(baseSettler)), 0);
        assertEq(lz.pending(), 1, "CONFIRM queued");

        // ---- Deliver CONFIRM back to Ethereum ----
        vm.chainId(uint256(ETH_EID));
        uint256 bobBalBefore = bob.balance;
        lz.deliverNext();

        // Ethereum settled: Alice's intent → Settled, ETH released to Bob.
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Settled));
        assertEq(bob.balance, bobBalBefore + 1 ether, "bob received ETH on Ethereum");
        assertEq(address(ethSettler).balance, 0);
        assertEq(lz.pending(), 0, "queue drained");
    }

    /// @notice If the LZ delivery never happens, the source user can recover
    ///         their escrow after `LZ_TIMEOUT`.
    function testLz_droppedDelivery_thenRefundIfTimeout() public {
        vm.chainId(uint256(ETH_EID));
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 aliceHash = ethSettler.submitIntent{ value: 1 ether }(_aliceIntent(2));

        ethSettler.executeMatching{ value: 1 wei }(aliceHash, bytes32(uint256(0xCAFE)), 2400e6, 1 ether);

        // Drop the LZ message instead of delivering.
        lz.dropNext();

        // Too early to refund.
        vm.expectRevert(IntentSettler.LzTimeoutNotElapsed.selector);
        ethSettler.refundIfLzTimeout(aliceHash);

        // After LZ_TIMEOUT (6 hours), refund succeeds.
        vm.warp(block.timestamp + 6 hours + 1);
        uint256 aliceBalBefore = alice.balance;
        ethSettler.refundIfLzTimeout(aliceHash);

        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Refunded));
        assertEq(alice.balance, aliceBalBefore + 1 ether, "alice refunded");
        assertEq(address(ethSettler).balance, 0);
    }

    /// @notice An untrusted EID (no peer set) cannot deliver any message.
    function testLz_revertsIfPeerNotSet() public {
        // Remove Base's view of Ethereum as a peer.
        baseSettler.setPeer(ETH_EID, bytes32(0));

        // Attempt a flow: Alice submits on ETH, executeMatching, deliver to Base.
        vm.chainId(uint256(ETH_EID));
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 aliceHash = ethSettler.submitIntent{ value: 1 ether }(_aliceIntent(3));

        ethSettler.executeMatching{ value: 1 wei }(aliceHash, bytes32(uint256(0xCAFE)), 2400e6, 1 ether);

        // Delivery to Base reverts because Base no longer trusts EID 1.
        vm.chainId(uint256(BASE_EID));
        vm.expectRevert(); // OAppReceiver.OnlyPeer or _getPeerOrRevert NoPeer
        lz.deliverNext();
    }

    /// @notice **Explicit asymmetric-loss scenario** — documents the rare
    ///         black-swan case where EXECUTE_MATCH delivers but CONFIRM
    ///         doesn't return, and the source user refunds before CONFIRM
    ///         eventually arrives (R-06 from the Stage 3 final review).
    /// @dev This is a known, accepted property of the Phase 1 settlement
    ///      design. `LZ_TIMEOUT = 6 hours` is set to minimise the race
    ///      window. Phase 2B will eliminate this class entirely via HTLC
    ///      or a true two-phase commit using the reserved `Locked` state.
    function testLz_asymmetricLoss_documentedBehavior() public {
        // Alice on Eth, Bob on Base — full normal setup.
        vm.chainId(uint256(ETH_EID));
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 aliceHash = ethSettler.submitIntent{ value: 1 ether }(_aliceIntent(60));

        vm.chainId(uint256(BASE_EID));
        vm.startPrank(bob);
        usdc.approve(address(baseSettler), 2400e6);
        bytes32 bobHash = baseSettler.submitIntent(_bobIntent(60));
        vm.stopPrank();

        // Match on Ethereum.
        vm.chainId(uint256(ETH_EID));
        ethSettler.executeMatching{ value: 1 wei }(aliceHash, bobHash, 2400e6, 1 ether);
        assertEq(lz.pending(), 1, "EXECUTE_MATCH queued");

        // Deliver EXECUTE_MATCH to Base — Bob's USDC released to Alice.
        vm.chainId(uint256(BASE_EID));
        lz.deliverNext();
        assertEq(usdc.balanceOf(alice), 2400e6, "alice received USDC");
        assertEq(uint256(baseSettler.intentStates(bobHash)), uint256(IIntentSettler.IntentState.Settled));
        assertEq(lz.pending(), 1, "CONFIRM queued");

        // **Catastrophic LZ failure**: drop the CONFIRM. Real-world cause
        // would be DVN config issue, executor outage spanning >6 hours, etc.
        lz.dropNext();
        assertEq(lz.pending(), 0, "CONFIRM never delivers");

        // 6 hours later, Alice self-refunds her source escrow.
        vm.chainId(uint256(ETH_EID));
        vm.warp(block.timestamp + 6 hours + 1);
        uint256 aliceEthBefore = alice.balance;
        ethSettler.refundIfLzTimeout(aliceHash);
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Refunded));
        assertEq(alice.balance, aliceEthBefore + 1 ether, "alice refunded");

        // Final state — DOCUMENTING the asymmetric outcome:
        //   Alice has: original 5 ETH (2 ETH-matching submissions cost some
        //   gas + 1 wei LZ fee, but the 1 ETH escrow was refunded) + 2400 USDC.
        //   Bob has:   no USDC (already released to Alice) and no ETH.
        // Bob is the loser in this black-swan event. Documented in
        // STAGE_3_FINAL_REVIEW.md (R-06).
        assertEq(usdc.balanceOf(alice), 2400e6, "alice keeps received USDC");
        assertEq(usdc.balanceOf(bob), 0, "bob's USDC is gone");
        assertEq(bob.balance, 0, "bob never received ETH");
    }

    /// @notice An EXECUTE_MATCH from a chain that does NOT match the local
    ///         intent's `destChainId` must be rejected — defense in depth
    ///         against multi-peer compromise (R-01 from the Stage 3 final review).
    function testLz_rejectsMessageFromWrongSourceChain() public {
        // Bob submits on Base with destChainId = ETH_EID (1).
        vm.chainId(uint256(BASE_EID));
        usdc.mint(bob, 2400e6);
        vm.startPrank(bob);
        usdc.approve(address(baseSettler), 2400e6);
        bytes32 bobHash = baseSettler.submitIntent(_bobIntent(50));
        vm.stopPrank();

        // Add a "rogue" peer at EID 99. The OApp peer check will pass for
        // any message claiming srcEid=99 with sender=`address(this)`. The
        // `chainRegistry` does NOT map Bob's destChainId (ETH_EID=1) to
        // EID 99 — so the new R-01 guard must reject.
        uint32 rogueEid = 99;
        baseSettler.setPeer(rogueEid, _addrToBytes32(address(this)));
        // Register `address(this)` at the rogue EID so the mock identifies
        // our test contract as the EID-99 sender when it captures the send.
        lz.registerOApp(rogueEid, address(this));

        // Send EXECUTE_MATCH payload as if Bob's intent matches some intent
        // on chain 99. Mock captures srcEid=99 because address(this) is
        // registered there.
        bytes memory payload = abi.encode(uint8(1), uint8(1), bytes32(uint256(0xCAFE)), bobHash, address(0xEEE));
        vm.deal(address(this), 1 wei);
        lz.send{ value: 1 wei }(
            _params(BASE_EID, _addrToBytes32(address(baseSettler)), payload), payable(address(this))
        );

        vm.chainId(uint256(BASE_EID));
        vm.expectRevert(); // WrongSourceEidForIntent
        lz.deliverNext();
    }

    /// @notice Direct call to `lzReceive` from a non-endpoint address must revert.
    function testLz_lzReceive_onlyEndpoint() public {
        bytes memory payload = abi.encode(uint8(1), uint8(1), bytes32(0), bytes32(0), address(0));
        vm.expectRevert(); // OAppReceiver.OnlyEndpoint
        ethSettler.lzReceive(
            // wrong sender (this contract, not endpoint)
            _origin(BASE_EID, _addrToBytes32(address(baseSettler))),
            bytes32(0),
            payload,
            address(0),
            ""
        );
    }

    /// @notice Unknown message type must revert cleanly.
    function testLz_unknownMessageType_reverts() public {
        // Construct a payload with msgType=99 (unknown).
        bytes memory bad = abi.encode(uint8(99), uint8(1), bytes32(0), bytes32(0), address(0));
        // Fund the sender (impersonated ethSettler) so it can pay the LZ fee.
        vm.deal(address(ethSettler), 1 wei);
        vm.prank(address(ethSettler));
        lz.send{ value: 1 wei }(_params(BASE_EID, _addrToBytes32(address(baseSettler)), bad), payable(address(this)));

        vm.chainId(uint256(BASE_EID));
        vm.expectRevert(); // UnknownMessageType
        lz.deliverNext();
    }

    /// @notice Wrong message version must revert cleanly.
    function testLz_wrongVersion_reverts() public {
        bytes memory bad = abi.encode(uint8(1), uint8(99), bytes32(0), bytes32(0), address(0));
        vm.deal(address(ethSettler), 1 wei);
        vm.prank(address(ethSettler));
        lz.send{ value: 1 wei }(_params(BASE_EID, _addrToBytes32(address(baseSettler)), bad), payable(address(this)));

        vm.chainId(uint256(BASE_EID));
        vm.expectRevert(); // UnsupportedMessageVersion
        lz.deliverNext();
    }

    // ---------------- helpers ----------------

    function _origin(uint32 srcEid, bytes32 sender) internal pure returns (Origin memory) {
        return Origin({ srcEid: srcEid, sender: sender, nonce: 0 });
    }

    function _params(uint32 dstEid, bytes32 receiver, bytes memory message)
        internal
        pure
        returns (MessagingParams memory)
    {
        return
            MessagingParams({ dstEid: dstEid, receiver: receiver, message: message, options: "", payInLzToken: false });
    }

    /// @notice **Full cross-chain auction flow** — combines Stage 2 (LayerZero)
    ///         + Stage 3 (SolverAuction). Verifies that a solver-driven match
    ///         settles end-to-end across two chains, exactly the same way a
    ///         P2P match does.
    /// @dev Flow:
    ///      1. Alice submits intent on Eth (no Bob waiting on Base)
    ///      2. AUCTION_DELAY elapses, Eth.openAuction → Auctioning
    ///      3. SolverAuction window opens via the wired call
    ///      4. Solver submits a signed proposal
    ///      5. Auction closes; executeWinningProposal records solver
    ///      6. Solver acts as counterparty: submits an intent on Base with
    ///         their USDC, dest = Eth, user = solver
    ///      7. Backend calls executeMatching on Eth (from Auctioning) → LZ
    ///      8. Mock delivers EXECUTE_MATCH to Base → solver's USDC released to Alice
    ///      9. Mock delivers CONFIRM to Eth → Alice's ETH released to solver
    ///     10. Both chains end at Settled
    function testLz_fullSolverAuctionRoundTrip() public {
        // ---- Wire SolverAuction into both settlers ----
        SolverAuction ethAuction = new SolverAuction(address(ethSettler));
        ethSettler.setSolverAuction(address(ethAuction));

        // ---- Alice submits on Ethereum, no P2P match ----
        vm.chainId(uint256(ETH_EID));
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 aliceHash = ethSettler.submitIntent{ value: 1 ether }(_aliceIntent(10));

        // ---- Open auction after delay ----
        vm.warp(block.timestamp + 31);
        ethSettler.openAuction(aliceHash);
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Auctioning));
        assertGt(ethAuction.auctionCloseTime(aliceHash), 0, "auction window propagated");

        // ---- Solver submits signed proposal ----
        uint256 solverPk = 0x501;
        address solver = vm.addr(solverPk);
        bytes32 digest = ethAuction.proposalDigest(aliceHash, 2410e6, 25);
        (uint8 sigV, bytes32 sigR, bytes32 sigS) = vm.sign(solverPk, digest);
        bytes memory sig = abi.encodePacked(sigR, sigS, sigV);

        vm.prank(solver);
        ethAuction.submitProposal(aliceHash, 2410e6, 25, sig);

        // ---- Close auction, announce winner ----
        vm.warp(block.timestamp + 31);
        (address winner, uint256 winningAmount) = ethAuction.executeWinningProposal(aliceHash);
        assertEq(winner, solver);
        assertEq(winningAmount, 2410e6);

        // ---- Solver becomes counterparty on Base ----
        vm.chainId(uint256(BASE_EID));
        usdc.mint(solver, 2410e6);
        vm.startPrank(solver);
        usdc.approve(address(baseSettler), 2410e6);
        IIntentSettler.Intent memory solverIntent = IIntentSettler.Intent({
            sourceChainId: uint256(BASE_EID),
            sourceToken: address(usdc),
            sourceAmount: 2410e6,
            destChainId: uint256(ETH_EID),
            destToken: address(0),
            minDestAmount: 1 ether,
            user: solver,
            refundTo: address(0),
            deadline: block.timestamp + 1 days,
            nonce: 99
        });
        bytes32 solverHash = baseSettler.submitIntent(solverIntent);
        vm.stopPrank();

        // ---- Backend calls executeMatching on Eth (from Auctioning state) ----
        vm.chainId(uint256(ETH_EID));
        ethSettler.executeMatching{ value: 1 wei }(aliceHash, solverHash, 2410e6, 1 ether);
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Matched));
        assertEq(lz.pending(), 1, "EXECUTE_MATCH queued");

        // ---- Deliver EXECUTE_MATCH to Base ----
        vm.chainId(uint256(BASE_EID));
        lz.deliverNext();
        assertEq(uint256(baseSettler.intentStates(solverHash)), uint256(IIntentSettler.IntentState.Settled));
        assertEq(usdc.balanceOf(alice), 2410e6, "alice received USDC on Base");

        // ---- Deliver CONFIRM to Eth ----
        vm.chainId(uint256(ETH_EID));
        uint256 solverEthBalBefore = solver.balance;
        lz.deliverNext();
        assertEq(uint256(ethSettler.intentStates(aliceHash)), uint256(IIntentSettler.IntentState.Settled));
        assertEq(solver.balance, solverEthBalBefore + 1 ether, "solver received ETH on Eth");
    }

    receive() external payable { }
}
