import {describe, expect, it, vi, beforeEach} from 'vitest';
import {Wallet, type Signer} from 'ethers';
import {buildChainSubmitters} from '../src/services/chain-submitters';

// Mock ethers Contract so we can intercept the calls without a live RPC.
// The mock factory returns a class whose instances are the contract; the
// settler/auction methods are vi.fn() on the prototype-like shape.
const settlerCalls = vi.hoisted(() => ({
  quoteMatching: vi.fn(),
  executeMatching: vi.fn(),
  openAuction: vi.fn(),
}));
const auctionCalls = vi.hoisted(() => ({
  executeWinningProposal: vi.fn(),
}));

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation((address: string) => {
      const isSettler = address.startsWith('0x11');
      return isSettler ? settlerCalls : auctionCalls;
    }),
  };
});

const TX_HASH = '0x' + 'c'.repeat(64);
const HASH_A = '0x' + 'a'.repeat(64);
const HASH_B = '0x' + 'b'.repeat(64);
const SETTLER = '0x' + '11'.repeat(20);
const AUCTION = '0x' + '22'.repeat(20);

const fakeReceipt = (hash: string) => ({hash});

let signer: Signer;

beforeEach(() => {
  signer = new Wallet('0x' + '01'.repeat(32));
  settlerCalls.quoteMatching.mockReset();
  settlerCalls.executeMatching.mockReset();
  settlerCalls.openAuction.mockReset();
  auctionCalls.executeWinningProposal.mockReset();
});

describe('matchSubmitter', () => {
  it('quotes the LZ fee and submits executeMatching', async () => {
    settlerCalls.quoteMatching.mockResolvedValue({nativeFee: 1000n, lzTokenFee: 0n});
    settlerCalls.executeMatching.mockResolvedValue({
      hash: TX_HASH,
      wait: async () => fakeReceipt(TX_HASH),
    });
    const {matchSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await matchSubmitter({sourceChainId: 1, localHash: HASH_A, remoteHash: HASH_B});
    expect(result).toEqual({txHash: TX_HASH});
    expect(settlerCalls.quoteMatching).toHaveBeenCalledWith(HASH_A, HASH_B);
    expect(settlerCalls.executeMatching).toHaveBeenCalledWith(HASH_A, HASH_B, {value: 1000n});
  });

  it('returns chain-mismatch error when called for a different chain', async () => {
    const {matchSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await matchSubmitter({sourceChainId: 8453, localHash: HASH_A, remoteHash: HASH_B});
    expect(result).toMatchObject({error: expect.stringMatching(/chain mismatch/)});
    expect(settlerCalls.quoteMatching).not.toHaveBeenCalled();
  });

  it('classifies AlreadySettled as a skip-level failure', async () => {
    settlerCalls.quoteMatching.mockResolvedValue({nativeFee: 1n, lzTokenFee: 0n});
    settlerCalls.executeMatching.mockRejectedValue(
      Object.assign(new Error('execution reverted: AlreadySettled'), {revert: {name: 'AlreadySettled'}})
    );
    const {matchSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await matchSubmitter({sourceChainId: 1, localHash: HASH_A, remoteHash: HASH_B});
    expect(result).toMatchObject({error: expect.stringMatching(/skipped: AlreadySettled/)});
  });
});

describe('openAuctionSubmitter', () => {
  it('calls openAuction', async () => {
    settlerCalls.openAuction.mockResolvedValue({
      hash: TX_HASH,
      wait: async () => fakeReceipt(TX_HASH),
    });
    const {openAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await openAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toEqual({txHash: TX_HASH});
    expect(settlerCalls.openAuction).toHaveBeenCalledWith(HASH_A);
  });

  it('treats InvalidState (already auctioning) as skip', async () => {
    settlerCalls.openAuction.mockRejectedValue(
      Object.assign(new Error('execution reverted: InvalidState'), {revert: {name: 'InvalidState'}})
    );
    const {openAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await openAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toEqual({skipped: 'InvalidState'});
  });
});

describe('finalizeAuctionSubmitter', () => {
  it('calls executeWinningProposal on the auction contract', async () => {
    auctionCalls.executeWinningProposal.mockResolvedValue({
      hash: TX_HASH,
      wait: async () => fakeReceipt(TX_HASH),
    });
    const {finalizeAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await finalizeAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toEqual({txHash: TX_HASH});
    expect(auctionCalls.executeWinningProposal).toHaveBeenCalledWith(HASH_A);
  });

  it('treats EmptyAuction as skip (no proposals yet)', async () => {
    auctionCalls.executeWinningProposal.mockRejectedValue(
      Object.assign(new Error('execution reverted: EmptyAuction'), {revert: {name: 'EmptyAuction'}})
    );
    const {finalizeAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await finalizeAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toEqual({skipped: 'EmptyAuction'});
  });

  it('treats AlreadyAnnounced as skip (idempotent)', async () => {
    auctionCalls.executeWinningProposal.mockRejectedValue(
      Object.assign(new Error('execution reverted: AlreadyAnnounced'), {revert: {name: 'AlreadyAnnounced'}})
    );
    const {finalizeAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await finalizeAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toEqual({skipped: 'AlreadyAnnounced'});
  });

  it('non-skip errors come back as {error}', async () => {
    auctionCalls.executeWinningProposal.mockRejectedValue(new Error('rpc down'));
    const {finalizeAuctionSubmitter} = buildChainSubmitters({
      chainId: 1,
      signer,
      intentSettler: SETTLER,
      solverAuction: AUCTION,
    });
    const result = await finalizeAuctionSubmitter({sourceChainId: 1, intentHash: HASH_A});
    expect(result).toMatchObject({error: expect.stringMatching(/rpc down/)});
  });
});
