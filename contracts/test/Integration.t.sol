// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { SolverAuction } from "../src/SolverAuction.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";

/// @dev Stage-1 + Stage-2 lifecycle scenarios. See `IntentSettler.lz.t.sol`
///      for the full cross-chain P2P flow with two settlers + mock endpoint.
contract IntegrationTest is Test {
    function testStackDeploys() public {
        MockLzEndpoint lz = new MockLzEndpoint();
        IntentSettler s = new IntentSettler(address(0), address(lz), address(this));
        lz.registerOApp(1, address(s));
        new SolverAuction(address(s));
        assertTrue(true);
    }

    function testIntentLifecycle_submitThenCancel() public {
        vm.chainId(1);
        ChainPeerRegistry registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        MockLzEndpoint lz = new MockLzEndpoint();
        IntentSettler settler = new IntentSettler(address(registry), address(lz), address(this));
        lz.registerOApp(1, address(settler));

        address alice = address(0xA11CE);
        vm.deal(alice, 5 ether);

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: 2 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 200e6,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 600,
            nonce: 1
        });

        vm.startPrank(alice);
        bytes32 hash = settler.submitIntent{ value: 2 ether }(intent);
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Pending));
        assertEq(address(settler).balance, 2 ether);

        settler.cancelIntent(hash);
        vm.stopPrank();

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Cancelled));
        assertEq(alice.balance, 5 ether, "alice fully refunded");
        assertEq(address(settler).balance, 0);
    }

    function testIntentLifecycle_submitMatchesAndOpensAuctionPath() public {
        vm.chainId(1);
        ChainPeerRegistry registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        MockLzEndpoint lz = new MockLzEndpoint();
        IntentSettler settler = new IntentSettler(address(registry), address(lz), address(this));
        lz.registerOApp(1, address(settler));

        // Wire SolverAuction to the settler. The constructor takes the settler
        // address; the settler's `setSolverAuction` closes the loop. Now
        // `openAuction` on the settler also opens the auction window.
        SolverAuction auction = new SolverAuction(address(settler));
        settler.setSolverAuction(address(auction));

        address alice = address(0xA11CE);
        vm.deal(alice, 5 ether);

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 2400e6,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 600,
            nonce: 1
        });

        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(intent);

        // Fast-forward past AUCTION_DELAY. `settler.openAuction` now ALSO
        // opens the auction window on the SolverAuction contract via the
        // wired reference — no separate `setAuctionWindow` call needed.
        vm.warp(block.timestamp + 31);
        settler.openAuction(hash);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Auctioning));
        assertGt(auction.auctionCloseTime(hash), 0, "auction window opened on the auction contract");

        // Solver submits a signed proposal during the window.
        uint256 solverPk = 0x501;
        address solver = vm.addr(solverPk);
        bytes32 digest = auction.proposalDigest(hash, 2410e6, 25);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(solverPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(solver);
        auction.submitProposal(hash, 2410e6, 25, sig);

        vm.warp(block.timestamp + 31);
        (address winner, uint256 amount) = auction.selectWinner(hash);
        assertEq(winner, solver);
        assertEq(amount, 2410e6);
    }
}
