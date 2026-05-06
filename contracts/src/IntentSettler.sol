// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIntentSettler} from "./interfaces/IIntentSettler.sol";
import {IntentHash} from "./libraries/IntentHash.sol";

/// @title IntentSettler
/// @dev Skeleton: records intents and emits events. Escrow + LayerZero in later PRs.
/// @dev Multi-chain: drive routing from `intent.sourceChainId` / `intent.destChainId` plus a peer or registry
///      (see `IChainPeerRegistry` and docs/ARCHITECTURE.md — Multi-chain extensibility). Avoid hardcoding one L2.
contract IntentSettler is IIntentSettler {
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => IntentState) public intentStates;

    function submitIntent(Intent calldata intent) external payable override returns (bytes32 intentHash) {
        require(intent.user == msg.sender, "IntentSettler: user mismatch");
        require(intent.deadline > block.timestamp, "IntentSettler: deadline passed");
        require(intent.sourceAmount > 0, "IntentSettler: amount");

        intentHash = IntentHash.hash(intent);
        require(intentStates[intentHash] == IntentState.None, "IntentSettler: duplicate");

        intents[intentHash] = intent;
        intentStates[intentHash] = IntentState.Pending;

        // TODO: escrow `intent.sourceToken` / ETH per MVP spec
        emit IntentSubmitted(intentHash, intent.user, intent);
    }
}
