// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IIntentSettler } from "../interfaces/IIntentSettler.sol";

/// @title IntentHash
/// @notice EIP-712 typed-data hashing for Intent structs.
/// @dev The library returns the **struct hash only**. The full EIP-712 digest
///      (`keccak256("\x19\x01" || domainSeparator || structHash)`) is computed
///      by the calling contract using its own `EIP712._hashTypedDataV4` so the
///      domain (chainId + verifyingContract) stays bound to the deployment.
library IntentHash {
    /// @notice EIP-712 type hash for the Intent struct. Field order MUST match
    ///         `IIntentSettler.Intent` exactly, otherwise on-chain and off-chain
    ///         hashes will diverge and signatures will fail.
    bytes32 internal constant INTENT_TYPEHASH = keccak256(
        "Intent(uint256 sourceChainId,address sourceToken,uint256 sourceAmount,"
        "uint256 destChainId,address destToken,uint256 minDestAmount,"
        "address user,address refundTo,uint256 deadline,uint256 nonce)"
    );

    /// @notice Return the EIP-712 struct hash for `intent`.
    function structHash(IIntentSettler.Intent memory intent) internal pure returns (bytes32) {
        return keccak256(
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
    }
}
