// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IChainPeerRegistry
/// @notice Boundary for supported routes and LayerZero addressing when adding chains without fork-specific contracts.
/// @dev See concrete `ChainPeerRegistry` — deploy **one per chain**, same logic, local config. A production `IntentSettler`
///      (LayerZero OApp) also uses `setPeer(eid, peer)` per remote endpoint; this registry supplies `chainId` → `eid` and
///      route rollout gates. Replace owner with timelock/governance before high-stakes mainnet.
interface IChainPeerRegistry {
    /// @return eid LayerZero V2 endpoint id for `chainId` (see LayerZero deployed-endpoints reference).
    function lzEidForChain(uint256 chainId) external view returns (uint32 eid);

    /// @notice Risk / rollout gate for an intent corridor (independent of UI listing).
    function isRouteSupported(uint256 sourceChainId, uint256 destChainId) external view returns (bool);
}
