// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IChainPeerRegistry } from "./interfaces/IChainPeerRegistry.sol";
import { IIntentSettler } from "./interfaces/IIntentSettler.sol";
import { IntentHash } from "./libraries/IntentHash.sol";

/// @title IntentSettler
/// @dev Skeleton: records intents and emits events. Escrow + LayerZero in later PRs.
/// @dev Multi-chain: `intent.sourceChainId` must match `block.chainid`. If `chainRegistry` is non-zero, the
///      `sourceChainId` → `destChainId` corridor must be enabled on `ChainPeerRegistry`. LayerZero `_lzSend` should use
///      `registry.lzEidForChain(intent.destChainId)` (see docs/ARCHITECTURE.md).
contract IntentSettler is IIntentSettler {
    /// @dev `address(0)` skips route checks (dev/tests only); production deployments should use a real `ChainPeerRegistry`.
    IChainPeerRegistry public immutable chainRegistry;

    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => IntentState) public intentStates;

    constructor(address chainRegistry_) {
        chainRegistry = IChainPeerRegistry(chainRegistry_);
    }

    function submitIntent(Intent calldata intent) external payable override returns (bytes32 intentHash) {
        require(intent.user == msg.sender, "IntentSettler: user mismatch");
        require(intent.deadline > block.timestamp, "IntentSettler: deadline passed");
        require(intent.sourceAmount > 0, "IntentSettler: amount");
        require(intent.sourceChainId == block.chainid, "IntentSettler: wrong chain");

        if (address(chainRegistry) != address(0)) {
            require(chainRegistry.isRouteSupported(intent.sourceChainId, intent.destChainId), "IntentSettler: route");
        }

        intentHash = IntentHash.hash(intent);
        require(intentStates[intentHash] == IntentState.None, "IntentSettler: duplicate");

        intents[intentHash] = intent;
        intentStates[intentHash] = IntentState.Pending;

        // TODO: escrow `intent.sourceToken` / ETH per MVP spec
        emit IntentSubmitted(intentHash, intent.user, intent);
    }
}
