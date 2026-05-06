// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";

contract IntentSettlerTest is Test {
    ChainPeerRegistry internal registry;
    IntentSettler internal settler;

    function setUp() public {
        vm.chainId(1);
        registry = new ChainPeerRegistry(address(this));
        registry.setRouteSupported(1, 8453, true);
        settler = new IntentSettler(address(registry));
    }

    function testSubmitIntent_storesPending() public {
        address alice = address(0xA11CE);
        vm.startPrank(alice);

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0xBEEF),
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 100e6,
            user: alice,
            deadline: block.timestamp + 300,
            nonce: 0
        });

        bytes32 intentHash = keccak256(
            abi.encode(
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destChainId,
                intent.destToken,
                intent.minDestAmount,
                intent.user,
                intent.deadline,
                intent.nonce
            )
        );

        bytes32 returned = settler.submitIntent(intent);
        assertEq(returned, intentHash);
        assertEq(uint256(settler.intentStates(returned)), uint256(IIntentSettler.IntentState.Pending));

        (,, uint256 sourceAmount,,,, address user,,) = settler.intents(returned);
        assertEq(user, alice);
        assertEq(sourceAmount, 1 ether);

        vm.stopPrank();
    }

    function testSubmitIntent_revertsWrongSourceChain() public {
        vm.chainId(8453);
        ChainPeerRegistry r = new ChainPeerRegistry(address(this));
        r.setRouteSupported(8453, 1, true);
        IntentSettler s = new IntentSettler(address(r));
        address bob = address(0xB0B);
        vm.startPrank(bob);

        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0xBEEF),
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: bob,
            deadline: block.timestamp + 300,
            nonce: 2
        });
        vm.expectRevert(bytes("IntentSettler: wrong chain"));
        s.submitIntent(intent);
        vm.stopPrank();
    }

    function testSubmitIntent_revertsUnsupportedRoute() public {
        registry.setRouteSupported(1, 8453, false);
        address bob = address(0xB0B);
        vm.startPrank(bob);
        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0xBEEF),
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: bob,
            deadline: block.timestamp + 300,
            nonce: 3
        });
        vm.expectRevert(bytes("IntentSettler: route"));
        settler.submitIntent(intent);
        vm.stopPrank();
    }

    function testSubmitIntent_noRegistry_skipsRouteCheck() public {
        vm.chainId(1);
        IntentSettler loose = new IntentSettler(address(0));
        address bob = address(0xB0B);
        vm.startPrank(bob);
        IIntentSettler.Intent memory intent = IIntentSettler.Intent({
            sourceChainId: 1,
            sourceToken: address(0xBEEF),
            sourceAmount: 1 wei,
            destChainId: 999999,
            destToken: address(0xCAFE),
            minDestAmount: 1,
            user: bob,
            deadline: block.timestamp + 300,
            nonce: 4
        });
        loose.submitIntent(intent);
        vm.stopPrank();
    }
}
