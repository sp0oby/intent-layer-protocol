// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IChainPeerRegistry} from "./interfaces/IChainPeerRegistry.sol";

/// @title ChainPeerRegistry
/// @notice Owner-configured `chainId` → LayerZero V2 endpoint id + intent route allowlist for a **single chain deployment**.
/// @dev Deploy one registry **per chain** (same bytecode everywhere). Each deployment stores the mappings relevant to
///      that chain’s `IntentSettler` (e.g. on Ethereum: `lzEidForChain(8453)`, `isRouteSupported(1, 8453)`). Adding a new
///      chain: deploy settler + registry on the new chain, configure peers on OApp, then **set EIDs and routes on every**
///      existing registry via tooling or multisig. Prefer transferring `owner` to timelock/governance before mainnet.
contract ChainPeerRegistry is IChainPeerRegistry {
    address public owner;

    mapping(uint256 => uint32) private _lzEid;
    mapping(uint256 => mapping(uint256 => bool)) private _routeSupported;

    error NotOwner();
    error ZeroAddress();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LzEidSet(uint256 indexed chainId, uint32 eid);
    event RouteSupportSet(uint256 indexed sourceChainId, uint256 indexed destChainId, bool supported);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param initialOwner Admin that may set EIDs and routes (use multisig / timelock in production).
    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Transfer admin rights for configuring EIDs and supported routes.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Set or clear (eid == 0) the LayerZero V2 endpoint id for a canonical `chainId`.
    function setLzEidForChain(uint256 chainId, uint32 eid) external onlyOwner {
        _lzEid[chainId] = eid;
        emit LzEidSet(chainId, eid);
    }

    /// @notice Allow or disallow `sourceChainId` → `destChainId` for settlement; checked at intent submit when wired into `IntentSettler`.
    function setRouteSupported(uint256 sourceChainId, uint256 destChainId, bool supported) external onlyOwner {
        _routeSupported[sourceChainId][destChainId] = supported;
        emit RouteSupportSet(sourceChainId, destChainId, supported);
    }

    /// @inheritdoc IChainPeerRegistry
    function lzEidForChain(uint256 chainId) external view override returns (uint32 eid) {
        return _lzEid[chainId];
    }

    /// @inheritdoc IChainPeerRegistry
    function isRouteSupported(uint256 sourceChainId, uint256 destChainId) external view override returns (bool) {
        return _routeSupported[sourceChainId][destChainId];
    }
}
