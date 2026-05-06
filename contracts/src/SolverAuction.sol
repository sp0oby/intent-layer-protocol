// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Skeleton auction for solver proposals (fill in selection + settlement logic).
contract SolverAuction {
    struct SolverProposal {
        bytes32 intentHash;
        uint256 proposedOutputAmount;
        uint256 solverFeeBps;
        bytes signature;
    }

    event ProposalSubmitted(bytes32 indexed intentHash, address indexed solver, SolverProposal proposal);
    event WinnerSelected(bytes32 indexed intentHash, address indexed solver);

    mapping(bytes32 => SolverProposal[]) internal proposalsByIntent;

    function submitProposal(bytes32 intentHash, SolverProposal calldata proposal) external {
        require(proposal.intentHash == intentHash, "SolverAuction: hash mismatch");
        proposalsByIntent[intentHash].push(proposal);
        emit ProposalSubmitted(intentHash, msg.sender, proposal);
    }

    /// @dev Stub: production version ranks by proposedOutputAmount and validates signatures.
    function selectWinner(bytes32 intentHash) external returns (address winner) {
        SolverProposal[] storage proposals = proposalsByIntent[intentHash];
        require(proposals.length > 0, "SolverAuction: empty");
        winner = address(uint160(uint256(keccak256(abi.encodePacked(intentHash, proposals.length)))));
        emit WinnerSelected(intentHash, winner);
    }
}
