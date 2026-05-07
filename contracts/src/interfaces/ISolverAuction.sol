// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISolverAuction
/// @notice The narrow surface `IntentSettler` calls on the solver auction.
///         Kept tiny so the settler's bytecode does not pull in the full
///         auction implementation.
interface ISolverAuction {
    /// @notice Open the auction window for `intentHash`. Gated to the linked
    ///         `IntentSettler` once `SolverAuction` knows about it.
    function setAuctionWindow(bytes32 intentHash, uint256 closeTime) external;
}
