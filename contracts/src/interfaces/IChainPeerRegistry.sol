// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IChainPeerRegistry
/// @notice Boundary for supported routes and LayerZero addressing when adding chains without fork-specific contracts.
/// @dev A production `IntentSettler` built on LayerZero OApp will also use `setPeer(eid, peer)` per remote endpoint.
///      This interface documents what the settlement layer should query instead of hardcoding chain names.
///      Phase 1 may use a simple owner-administered contract; later swap for timelock/governance.
interface IChainPeerRegistry {
    /// @return eid LayerZero V2 endpoint id for `chainId` (see LayerZero deployed-endpoints reference).
    function lzEidForChain(uint256 chainId) external view returns (uint32 eid);

    /// @notice Risk / rollout gate for an intent corridor (independent of UI listing).
    function isRouteSupported(uint256 sourceChainId, uint256 destChainId) external view returns (bool);
}
