// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ChainPeerRegistry } from "../src/ChainPeerRegistry.sol";

contract ChainPeerRegistryTest is Test {
    ChainPeerRegistry internal reg;
    address internal alice = address(0xA11CE);

    function setUp() public {
        reg = new ChainPeerRegistry(alice);
    }

    function testOwner_canSetEidAndRoute() public {
        vm.startPrank(alice);
        reg.setLzEidForChain(8453, 30110);
        reg.setRouteSupported(1, 8453, true);
        vm.stopPrank();

        assertEq(reg.lzEidForChain(8453), uint32(30110));
        assertTrue(reg.isRouteSupported(1, 8453));
        assertFalse(reg.isRouteSupported(8453, 1));
    }

    function testNonOwner_reverts() public {
        vm.expectRevert(ChainPeerRegistry.NotOwner.selector);
        reg.setLzEidForChain(1, 42);

        vm.expectRevert(ChainPeerRegistry.NotOwner.selector);
        reg.setRouteSupported(1, 2, true);
    }

    function test_transferOwnership() public {
        address bob = address(0xB0B);
        vm.prank(alice);
        reg.transferOwnership(bob);
        assertEq(reg.owner(), bob);

        vm.prank(bob);
        reg.setRouteSupported(10, 20, true);
        assertTrue(reg.isRouteSupported(10, 20));
    }

    function test_constructor_zeroOwner_reverts() public {
        vm.expectRevert(ChainPeerRegistry.ZeroAddress.selector);
        new ChainPeerRegistry(address(0));
    }

    function test_transferOwnership_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ChainPeerRegistry.ZeroAddress.selector);
        reg.transferOwnership(address(0));
    }

    function test_clearEid_withZero() public {
        vm.startPrank(alice);
        reg.setLzEidForChain(10, 99);
        reg.setLzEidForChain(10, 0);
        vm.stopPrank();
        assertEq(reg.lzEidForChain(10), uint32(0));
    }
}
