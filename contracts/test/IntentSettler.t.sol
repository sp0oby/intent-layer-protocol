// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IntentSettler} from "../src/IntentSettler.sol";
import {IIntentSettler} from "../src/interfaces/IIntentSettler.sol";

contract IntentSettlerTest is Test {
    IntentSettler internal settler;

    function setUp() public {
        settler = new IntentSettler();
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

        (
            ,
            ,
            uint256 sourceAmount,
            ,
            ,
            ,
            address user,
            ,
            ) = settler.intents(returned);
        assertEq(user, alice);
        assertEq(sourceAmount, 1 ether);

        vm.stopPrank();
    }
}
