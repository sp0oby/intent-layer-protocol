// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal helpers; expand with OpenZeppelin SafeERC20 before mainnet.
library SafeTransfer {
    error TransferFailed();

    function safeTransferETH(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
