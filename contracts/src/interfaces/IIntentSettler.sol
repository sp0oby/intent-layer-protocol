// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Core intent lifecycle interface (expand per MVP spec).
interface IIntentSettler {
    struct Intent {
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        address user;
        uint256 deadline;
        uint256 nonce;
    }

    enum IntentState {
        None,
        Pending,
        Matched,
        Locked,
        Settled,
        Cancelled,
        Refunded
    }

    event IntentSubmitted(bytes32 indexed intentHash, address indexed user, Intent intent);

    function submitIntent(Intent calldata intent) external payable returns (bytes32 intentHash);
}
