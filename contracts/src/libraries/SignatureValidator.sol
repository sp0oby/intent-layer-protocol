// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title SignatureValidator
/// @notice ECDSA signature validation for solver proposals and (future) intent signatures.
/// @dev Wraps OZ `ECDSA.recover` to allow `tryRecover` semantics — invalid signatures
///      return false instead of reverting, so callers can decide how to react.
library SignatureValidator {
    /// @notice Verify that `signature` was produced by `signer` over `digest`.
    /// @param signer Expected signer address.
    /// @param digest Hash that was signed (caller's responsibility to construct
    ///               via EIP-712 or `MessageHashUtils.toEthSignedMessageHash`).
    /// @param signature Raw signature bytes (65 bytes for ECDSA `r || s || v`).
    function isValidSignature(address signer, bytes32 digest, bytes memory signature) internal pure returns (bool) {
        if (signer == address(0)) return false;
        // slither-disable-next-line unused-return — `errArg` is OZ's debug context (only set
        // when err != NoError) and intentionally unused here; we already gate on `err`.
        (address recovered, ECDSA.RecoverError err, bytes32 errArg) = ECDSA.tryRecover(digest, signature);
        errArg; // silence unused-variable lint while keeping the destructure explicit.
        return err == ECDSA.RecoverError.NoError && recovered == signer;
    }
}
