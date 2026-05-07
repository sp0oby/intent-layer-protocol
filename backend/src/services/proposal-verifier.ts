/**
 * ECDSA verification for solver proposals.
 *
 * Mirrors the on-chain digest in `SolverAuction.proposalDigest`:
 *
 *     keccak256(
 *         abi.encode(
 *             SIGNATURE_DOMAIN,    // bytes32("ILP-SolverProposal-v1")
 *             block.chainid,       // uint256
 *             address(this),       // SolverAuction address
 *             intentHash,          // bytes32
 *             proposedOutputAmount,// uint256
 *             solverFeeBps         // uint16
 *         )
 *     )
 *
 * The signature is then verified with `ECDSA.tryRecover` against the raw
 * digest (no eth_signedMessage prefix), so we use ethers' `recoverAddress`
 * with the digest directly.
 */

import {AbiCoder, encodeBytes32String, getAddress, isHexString, keccak256, recoverAddress} from 'ethers';

/** Stored as bytes32 on-chain, NOT a UTF-8-length-prefixed string — see
 *  SolverAuction.SIGNATURE_DOMAIN natspec. We use ethers'
 *  `encodeBytes32String` so the JS-side encoding matches the Solidity
 *  literal byte-for-byte. */
export const SIGNATURE_DOMAIN = encodeBytes32String('ILP-SolverProposal-v1');

const FEE_BPS_MAX = 65535; // uint16

export interface ProposalDigestInputs {
  chainId: number;
  auctionAddress: string;
  intentHash: string;
  proposedOutputAmount: string | bigint;
  solverFeeBps: number;
}

export function proposalDigest(inputs: ProposalDigestInputs): string {
  if (!isHexString(inputs.intentHash, 32)) throw new Error('intentHash must be 0x-prefixed bytes32');
  if (inputs.solverFeeBps < 0 || inputs.solverFeeBps > FEE_BPS_MAX) {
    throw new Error(`solverFeeBps out of uint16 range: ${inputs.solverFeeBps}`);
  }
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'uint256', 'address', 'bytes32', 'uint256', 'uint16'],
    [
      SIGNATURE_DOMAIN,
      inputs.chainId,
      getAddress(inputs.auctionAddress),
      inputs.intentHash,
      BigInt(inputs.proposedOutputAmount),
      inputs.solverFeeBps,
    ]
  );
  return keccak256(encoded);
}

export interface VerifyResult {
  valid: boolean;
  digest: string;
  recovered?: string;
  reason?: string;
}

export function verifyProposalSignature(
  inputs: ProposalDigestInputs & {solver: string; signature: string}
): VerifyResult {
  let digest: string;
  try {
    digest = proposalDigest(inputs);
  } catch (err) {
    return {valid: false, digest: '0x', reason: err instanceof Error ? err.message : 'digest computation failed'};
  }

  if (!isHexString(inputs.signature)) {
    return {valid: false, digest, reason: 'signature must be 0x-prefixed hex'};
  }

  let recovered: string;
  try {
    recovered = recoverAddress(digest, inputs.signature);
  } catch (err) {
    return {valid: false, digest, reason: err instanceof Error ? err.message : 'signature recovery failed'};
  }

  let solverChecksum: string;
  try {
    solverChecksum = getAddress(inputs.solver);
  } catch {
    return {valid: false, digest, recovered, reason: 'solver is not a valid address'};
  }

  if (recovered.toLowerCase() !== solverChecksum.toLowerCase()) {
    return {valid: false, digest, recovered, reason: 'signature does not match solver'};
  }

  return {valid: true, digest, recovered};
}
