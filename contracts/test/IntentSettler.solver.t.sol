// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { SolverAuction } from "../src/SolverAuction.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";

/// @notice Stage-3 integration: `IntentSettler` ↔ `SolverAuction` wiring.
/// @dev Verifies the on-chain coupling end-to-end:
///      - `setSolverAuction` registers the auction on the settler
///      - `openAuction` on the settler opens the auction window on the
///        auction contract via the `setAuctionWindow` gate
///      - solvers submit signed proposals
///      - `executeWinningProposal` records the winner
///      - `executeMatching` accepts an `Auctioning` intent (the auction is
///        a discovery layer, not a settlement lock)
contract IntentSettlerSolverTest is Test {
    ChainPeerRegistry internal registry;
    IntentSettler internal settler;
    SolverAuction internal auction;
    MockLzEndpoint internal lz;

    address internal alice = address(0xA11CE);
    uint256 internal solverPk = 0x501;
    address internal solver;

    function setUp() public {
        vm.chainId(1);
        registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        registry.setLzEidForChain(8453, 8453);
        lz = new MockLzEndpoint();
        settler = new IntentSettler(address(registry), address(lz), address(this));
        lz.registerOApp(1, address(settler));

        // Wire the two contracts.
        auction = new SolverAuction(address(settler));
        settler.setSolverAuction(address(auction));

        // Set a peer so executeMatching's _lzSend can resolve a remote.
        settler.setPeer(8453, bytes32(uint256(uint160(address(0xBA5E)))));

        solver = vm.addr(solverPk);
    }

    function _aliceIntent(uint256 nonce_) internal view returns (IIntentSettler.Intent memory) {
        return IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0),
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 2400e6,
            user: alice,
            refundTo: address(0),
            deadline: block.timestamp + 1 hours,
            nonce: nonce_
        });
    }

    function _signProposal(bytes32 intentHash, uint256 outputAmount, uint16 feeBps)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = auction.proposalDigest(intentHash, outputAmount, feeBps);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(solverPk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @notice Full Stage-3 happy path: open auction → solver bids → winner
    ///         announced → executeMatching from Auctioning state.
    function testSolver_fullAuctionThenExecuteMatching() public {
        // Submit Alice's intent.
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(_aliceIntent(1));

        // Wait past AUCTION_DELAY, then open auction.
        vm.warp(block.timestamp + 31);
        settler.openAuction(hash);

        // Both contracts are aware of the auction.
        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Auctioning));
        assertGt(auction.auctionCloseTime(hash), 0);

        // Solver submits a signed proposal.
        bytes memory sig = _signProposal(hash, 2410e6, 25);
        vm.prank(solver);
        auction.submitProposal(hash, 2410e6, 25, sig);

        // Wait for auction to close, then announce winner.
        vm.warp(block.timestamp + 31);
        (address winner, uint256 amount) = auction.executeWinningProposal(hash);
        assertEq(winner, solver);
        assertEq(amount, 2410e6);

        // The off-chain backend now coordinates: solver submits a counterparty
        // intent on Base; backend calls executeMatching on Ethereum. Here we
        // simulate this by having the backend call executeMatching directly
        // from the Auctioning state (we don't need to actually submit on
        // Base — the local-side validation is what matters for this test).
        settler.executeMatching{ value: 1 wei }(hash, bytes32(uint256(0xBEEF)));

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Matched));
    }

    /// @notice openAuction on the settler MUST also open the window on the
    ///         auction contract — the wiring is the whole point of Stage 3.
    function testSolver_openAuctionPropagatesToAuctionContract() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(_aliceIntent(2));

        assertEq(auction.auctionCloseTime(hash), 0, "no window before openAuction");

        vm.warp(block.timestamp + 31);
        settler.openAuction(hash);

        assertGt(auction.auctionCloseTime(hash), 0, "window opens via wired call");
    }

    /// @notice setAuctionWindow on the auction contract MUST reject anyone
    ///         other than the wired settler.
    function testSolver_setAuctionWindow_gatedToSettler() public {
        bytes32 fakeHash = keccak256("fake");
        // Direct call from the test contract is rejected — only the wired
        // settler may open windows.
        vm.expectRevert(SolverAuction.NotIntentSettler.selector);
        auction.setAuctionWindow(fakeHash, block.timestamp + 30);
    }

    /// @notice cancelIntent still works while in Auctioning state — Stage 3
    ///         doesn't break the existing escape path.
    function testSolver_cancelStillWorksFromAuctioning() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        bytes32 hash = settler.submitIntent{ value: 1 ether }(_aliceIntent(3));

        vm.warp(block.timestamp + 31);
        settler.openAuction(hash);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        settler.cancelIntent(hash);

        assertEq(uint256(settler.intentStates(hash)), uint256(IIntentSettler.IntentState.Cancelled));
        assertEq(alice.balance, balBefore + 1 ether, "alice refunded from Auctioning state");
    }

    /// @notice setSolverAuction is owner-gated.
    function testSolver_setSolverAuction_onlyOwner() public {
        address randomCaller = address(0xBEEF);
        vm.prank(randomCaller);
        vm.expectRevert(); // Ownable: caller is not the owner
        settler.setSolverAuction(address(0));
    }

    receive() external payable { }
}
