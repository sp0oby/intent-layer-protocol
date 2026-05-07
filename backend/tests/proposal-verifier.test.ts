import {describe, expect, it} from 'vitest';
import {SigningKey, Wallet, getBytes} from 'ethers';
import {proposalDigest, verifyProposalSignature} from '../src/services/proposal-verifier';

const AUCTION = '0x' + '11'.repeat(20);
const INTENT_HASH = '0x' + 'aa'.repeat(32);

const sign = (digest: string, key: SigningKey): string => {
  const sig = key.sign(getBytes(digest));
  return sig.serialized;
};

describe('proposalDigest', () => {
  it('is deterministic for the same inputs', () => {
    const inputs = {
      chainId: 1,
      auctionAddress: AUCTION,
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    };
    expect(proposalDigest(inputs)).toBe(proposalDigest(inputs));
  });

  it('changes when chainId changes (replay protection across chains)', () => {
    const a = proposalDigest({
      chainId: 1,
      auctionAddress: AUCTION,
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    });
    const b = proposalDigest({
      chainId: 8453,
      auctionAddress: AUCTION,
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    });
    expect(a).not.toBe(b);
  });

  it('changes when auctionAddress changes', () => {
    const a = proposalDigest({
      chainId: 1,
      auctionAddress: AUCTION,
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    });
    const b = proposalDigest({
      chainId: 1,
      auctionAddress: '0x' + '22'.repeat(20),
      intentHash: INTENT_HASH,
      proposedOutputAmount: '2410000000',
      solverFeeBps: 50,
    });
    expect(a).not.toBe(b);
  });

  it('rejects out-of-range solverFeeBps', () => {
    expect(() =>
      proposalDigest({
        chainId: 1,
        auctionAddress: AUCTION,
        intentHash: INTENT_HASH,
        proposedOutputAmount: '1',
        solverFeeBps: 70_000,
      })
    ).toThrow(/uint16/);
  });

  it('rejects malformed intentHash', () => {
    expect(() =>
      proposalDigest({
        chainId: 1,
        auctionAddress: AUCTION,
        intentHash: '0xdeadbeef',
        proposedOutputAmount: '1',
        solverFeeBps: 0,
      })
    ).toThrow(/bytes32/);
  });
});

describe('verifyProposalSignature', () => {
  const wallet = new Wallet('0x' + '01'.repeat(32));

  const baseInputs = {
    chainId: 1,
    auctionAddress: AUCTION,
    intentHash: INTENT_HASH,
    proposedOutputAmount: '2410000000',
    solverFeeBps: 50,
  };

  it('accepts a signature produced by the claimed solver', () => {
    const digest = proposalDigest(baseInputs);
    const signature = sign(digest, wallet.signingKey);
    const result = verifyProposalSignature({
      ...baseInputs,
      solver: wallet.address,
      signature,
    });
    expect(result.valid).toBe(true);
    expect(result.digest).toBe(digest);
    expect(result.recovered?.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('rejects when the signer is not the claimed solver', () => {
    const digest = proposalDigest(baseInputs);
    const signature = sign(digest, wallet.signingKey);
    const otherAddress = new Wallet('0x' + '02'.repeat(32)).address;
    const result = verifyProposalSignature({
      ...baseInputs,
      solver: otherAddress,
      signature,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  it('rejects a signature over a tampered amount', () => {
    const digest = proposalDigest(baseInputs);
    const signature = sign(digest, wallet.signingKey);
    const result = verifyProposalSignature({
      ...baseInputs,
      proposedOutputAmount: '9999999999',
      solver: wallet.address,
      signature,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a signature for a different chain', () => {
    const digest = proposalDigest(baseInputs);
    const signature = sign(digest, wallet.signingKey);
    const result = verifyProposalSignature({
      ...baseInputs,
      chainId: 8453,
      solver: wallet.address,
      signature,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects malformed signature input cleanly', () => {
    const result = verifyProposalSignature({
      ...baseInputs,
      solver: wallet.address,
      signature: 'not-a-hex-string',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/0x-prefixed/);
  });
});
