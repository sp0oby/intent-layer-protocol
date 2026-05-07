// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SafeTransfer
/// @notice Native ETH transfer helper. ERC-20 operations should use OpenZeppelin
///         `SafeERC20` directly (handles non-standard returns like USDT correctly).
library SafeTransfer {
    error TransferFailed();

    /// @notice Forwards ETH using a low-level call. Reverts on failure.
    /// @dev Recipient is `payable` to make the ETH-receiving intent explicit at the
    ///      call site. CEI ordering is the caller's responsibility.
    function safeTransferETH(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }
}
