// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIntentSettler} from "../interfaces/IIntentSettler.sol";

/// @notice Canonical EIP-712 / struct hashing will replace this stub in production.
library IntentHash {
    function hash(IIntentSettler.Intent calldata intent) internal pure returns (bytes32) {
        return keccak256(
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
    }
}
