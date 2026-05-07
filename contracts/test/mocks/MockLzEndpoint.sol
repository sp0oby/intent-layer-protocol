// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    MessagingParams,
    MessagingFee,
    MessagingReceipt,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice Minimal LayerZero V2 endpoint mock for Foundry tests.
///         Captures every `send()` call into an in-memory queue. Tests then
///         trigger `deliverNext()` to push a queued message to the destination
///         OApp's `lzReceive`. Realistic enough to exercise the full
///         _lzSend → _lzReceive round-trip including peer validation.
/// @dev Solidity casts any address to `ILayerZeroEndpointV2` without
///      compile-time checks, so this mock does NOT inherit the full
///      interface (which would force implementing `IMessageLibManager`,
///      `IMessagingChannel`, etc. — irrelevant for our scope). Only the
///      four methods OAppCore/OAppSender actually invoke are implemented.
contract MockLzEndpoint {
    /// @notice Per-EID registered OApp address. Tests `registerOApp` after deploy.
    mapping(uint32 => address) public oappAt;

    /// @notice Per-OApp delegate (set via `setDelegate` from the OApp's constructor).
    mapping(address => address) public delegateOf;

    /// @notice Captured message awaiting delivery.
    struct Pending {
        uint32 srcEid;
        uint32 dstEid;
        address sender;
        bytes32 receiver; // dest OApp address as bytes32
        bytes message;
        bytes options;
        uint256 nativeFee;
    }

    Pending[] internal _queue;
    uint64 internal _nonce;

    /// @notice Fixed nominal fee so tests can verify the payable forwarding
    ///         path without modelling LayerZero's fee algorithm.
    uint256 public constant FIXED_NATIVE_FEE = 1 wei;

    /// @notice Emitted when `send()` enqueues a message. E2E tests use this
    ///         to relay messages between two MockLzEndpoint instances on
    ///         separate Anvil chains (the in-memory `deliverNext()` only
    ///         works within a single VM).
    event MessageQueued(
        uint32 srcEid, uint32 dstEid, address sender, bytes32 receiver, bytes message, uint256 nativeFee
    );

    /// @notice Test helper: register `oapp` as the OApp at `eid`.
    function registerOApp(uint32 eid, address oapp) external {
        oappAt[eid] = oapp;
    }

    // ---------------- methods OApp actually calls ----------------

    function setDelegate(address _delegate) external {
        delegateOf[msg.sender] = _delegate;
    }

    function quote(
        MessagingParams calldata,
        /*_params*/
        address /*_sender*/
    )
        external
        pure
        returns (MessagingFee memory)
    {
        return MessagingFee({ nativeFee: FIXED_NATIVE_FEE, lzTokenFee: 0 });
    }

    function send(
        MessagingParams calldata _params,
        address /*_refundAddress*/
    )
        external
        payable
        returns (MessagingReceipt memory)
    {
        require(msg.value >= FIXED_NATIVE_FEE, "MockLZ: fee");

        uint32 srcEid = _eidOf(msg.sender);

        _queue.push(
            Pending({
                srcEid: srcEid,
                dstEid: _params.dstEid,
                sender: msg.sender,
                receiver: _params.receiver,
                message: _params.message,
                options: _params.options,
                nativeFee: msg.value
            })
        );

        unchecked {
            ++_nonce;
        }
        emit MessageQueued(srcEid, _params.dstEid, msg.sender, _params.receiver, _params.message, msg.value);
        return MessagingReceipt({
            guid: keccak256(abi.encode(srcEid, _params.dstEid, _nonce)),
            nonce: _nonce,
            fee: MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 })
        });
    }

    /// @notice OAppSender calls this when `lzTokenFee > 0`. We always return
    ///         zero so this path is never exercised, but the function must
    ///         exist or the cast will revert.
    function lzToken() external pure returns (address) {
        return address(0);
    }

    // ---------------- test-only helpers ----------------

    /// @notice Deliver the next queued message to its destination OApp.
    /// @dev Real LayerZero V2 does NOT auto-forward the native fee to the
    ///      receiver. Native drops are an explicit executor option (which
    ///      we do not use). The fee stays in the endpoint balance; the dest
    ///      OApp must be pre-funded to send any return messages.
    function deliverNext() external returns (bool delivered) {
        if (_queue.length == 0) return false;
        Pending memory p = _queue[0];

        for (uint256 i = 1; i < _queue.length; ++i) {
            _queue[i - 1] = _queue[i];
        }
        _queue.pop();

        address dstOApp = address(uint160(uint256(p.receiver)));
        Origin memory origin = Origin({ srcEid: p.srcEid, sender: bytes32(uint256(uint160(p.sender))), nonce: _nonce });

        ILzReceiver(dstOApp).lzReceive(origin, bytes32(0), p.message, address(this), "");
        return true;
    }

    /// @notice Discard the next pending message without delivering it.
    ///         Used to simulate a LayerZero delivery failure.
    function dropNext() external returns (bool dropped) {
        if (_queue.length == 0) return false;
        for (uint256 i = 1; i < _queue.length; ++i) {
            _queue[i - 1] = _queue[i];
        }
        _queue.pop();
        return true;
    }

    function pending() external view returns (uint256) {
        return _queue.length;
    }

    /// @notice Externally-supplied delivery — used by E2E tests to relay a
    ///         message from one MockLzEndpoint instance (on chain A) to the
    ///         OApp registered on this instance (chain B). The same
    ///         `lzReceive` path as `deliverNext()`, but accepts the message
    ///         shape from the test relayer instead of reading from `_queue`.
    /// @dev    Permissionless — these mocks live on test networks only.
    function deliverInbound(uint32 _srcEid, address _sender, bytes32 _receiver, bytes calldata _message) external {
        address dstOApp = address(uint160(uint256(_receiver)));
        unchecked {
            ++_nonce;
        }
        Origin memory origin = Origin({ srcEid: _srcEid, sender: bytes32(uint256(uint160(_sender))), nonce: _nonce });
        ILzReceiver(dstOApp).lzReceive(origin, bytes32(0), _message, address(this), "");
    }

    // ---------------- internal ----------------

    function _eidOf(address oapp) internal view returns (uint32) {
        for (uint32 eid = 1; eid < 100; ++eid) {
            if (oappAt[eid] == oapp) return eid;
        }
        revert("MockLZ: unregistered OApp");
    }

    receive() external payable { }
}

interface ILzReceiver {
    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable;
}
