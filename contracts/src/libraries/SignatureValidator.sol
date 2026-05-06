// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stub: verify intent signatures (EIP-712) in a later milestone.
library SignatureValidator {
    function isValidSignature(address, bytes32, bytes memory signature) internal pure returns (bool) {
        return signature.length > 0;
    }
}
