// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { IIntentSettler } from "../src/interfaces/IIntentSettler.sol";
import { IntentHash } from "../src/libraries/IntentHash.sol";
import { IntentSettler } from "../src/IntentSettler.sol";
import { MockLzEndpoint } from "./mocks/MockLzEndpoint.sol";

/// @notice Verifies that on-chain EIP-712 hashing matches the canonical formula
///         a frontend (`viem` / `eth_signTypedData_v4`) would compute. Any drift
///         here means MetaMask signatures will not verify on-chain.
contract IntentHashTest is Test {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant INTENT_TYPEHASH = keccak256(
        "Intent(uint256 sourceChainId,address sourceToken,uint256 sourceAmount,"
        "uint256 destChainId,address destToken,uint256 minDestAmount,"
        "address user,address refundTo,uint256 deadline,uint256 nonce)"
    );

    IntentSettler internal settler;

    function setUp() public {
        vm.chainId(1);
        MockLzEndpoint lz = new MockLzEndpoint();
        settler = new IntentSettler(address(0), address(lz), address(this));
        lz.registerOApp(1, address(settler));
    }

    function _domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("IntentLayerProtocol")),
                keccak256(bytes("1")),
                block.chainid,
                verifyingContract
            )
        );
    }

    function _baseIntent() internal view returns (IIntentSettler.Intent memory) {
        return IIntentSettler.Intent({
            sourceChainId: block.chainid,
            sourceToken: address(0), // native ETH so submitIntent escrow works in this test
            sourceAmount: 1 ether,
            destChainId: 8453,
            destToken: address(0xCAFE),
            minDestAmount: 2400e6,
            user: address(0xA11CE),
            refundTo: address(0),
            deadline: 1_800_000_000,
            nonce: 42
        });
    }

    /// @notice Submitting an intent and re-deriving its hash off-chain via the
    ///         canonical EIP-712 formula must produce the same bytes32 returned
    ///         by `submitIntent`.
    function testHash_matchesEIP712Digest() public {
        IIntentSettler.Intent memory intent = _baseIntent();
        intent.user = address(this); // so msg.sender check passes
        vm.deal(address(this), 5 ether);

        bytes32 stored = settler.submitIntent{ value: 1 ether }(intent);

        bytes32 structHash = keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destChainId,
                intent.destToken,
                intent.minDestAmount,
                intent.user,
                intent.refundTo,
                intent.deadline,
                intent.nonce
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(settler)), structHash));

        assertEq(stored, expected, "on-chain hash must equal EIP-712 digest");
    }

    function testHash_changesWithDifferentNonce() public {
        IIntentSettler.Intent memory a = _baseIntent();
        IIntentSettler.Intent memory b = _baseIntent();
        b.nonce = 43;

        bytes32 hashA = IntentHash.structHash(a);
        bytes32 hashB = IntentHash.structHash(b);
        assertTrue(hashA != hashB, "nonce must affect hash");
    }

    function testHash_changesWithDifferentChain() public {
        IIntentSettler.Intent memory a = _baseIntent();
        IIntentSettler.Intent memory b = _baseIntent();
        b.sourceChainId = 8453;

        bytes32 hashA = IntentHash.structHash(a);
        bytes32 hashB = IntentHash.structHash(b);
        assertTrue(hashA != hashB, "sourceChainId must affect hash");
    }

    function testHash_changesWithRefundTo() public {
        IIntentSettler.Intent memory a = _baseIntent();
        IIntentSettler.Intent memory b = _baseIntent();
        b.refundTo = address(0xBEEF);

        bytes32 hashA = IntentHash.structHash(a);
        bytes32 hashB = IntentHash.structHash(b);
        assertTrue(hashA != hashB, "refundTo must affect hash");
    }

    /// @notice Required so the test contract itself can act as `intent.user` and
    ///         receive any refunds in `testHash_matchesEIP712Digest`.
    receive() external payable { }
}
