import {describe, expect, it} from 'vitest';
import IntentSettlerAbi from '../src/abis/IntentSettler.json';
import SolverAuctionAbi from '../src/abis/SolverAuction.json';
import ChainPeerRegistryAbi from '../src/abis/ChainPeerRegistry.json';

type AbiEntry = {type: string; name?: string};

const eventNames = (abi: AbiEntry[]): Set<string> =>
  new Set(abi.filter((entry) => entry.type === 'event' && entry.name).map((entry) => entry.name as string));

const functionNames = (abi: AbiEntry[]): Set<string> =>
  new Set(abi.filter((entry) => entry.type === 'function' && entry.name).map((entry) => entry.name as string));

describe('extracted ABIs match indexer expectations', () => {
  it('IntentSettler exposes every event the indexer subscribes to', () => {
    const events = eventNames(IntentSettlerAbi as AbiEntry[]);
    for (const name of [
      'IntentSubmitted',
      'IntentCancelled',
      'IntentMatched',
      'AuctionOpened',
      'IntentLocked',
      'IntentSettled',
      'IntentRefunded',
    ]) {
      expect(events, `IntentSettler missing event: ${name}`).toContain(name);
    }
  });

  it('IntentSettler exposes core lifecycle functions', () => {
    const fns = functionNames(IntentSettlerAbi as AbiEntry[]);
    for (const name of [
      'submitIntent',
      'cancelIntent',
      'executeMatching',
      'openAuction',
      'refundIfLzTimeout',
      'quoteMatching',
    ]) {
      expect(fns, `IntentSettler missing function: ${name}`).toContain(name);
    }
  });

  it('SolverAuction exposes auction events + functions', () => {
    const events = eventNames(SolverAuctionAbi as AbiEntry[]);
    expect(events).toContain('AuctionWindowSet');
    expect(events).toContain('ProposalSubmitted');
    expect(events).toContain('WinnerSelected');

    const fns = functionNames(SolverAuctionAbi as AbiEntry[]);
    expect(fns).toContain('submitProposal');
    expect(fns).toContain('executeWinningProposal');
    expect(fns).toContain('proposalDigest');
  });

  it('ChainPeerRegistry exposes route + EID readers', () => {
    const fns = functionNames(ChainPeerRegistryAbi as AbiEntry[]);
    expect(fns).toContain('lzEidForChain');
    expect(fns).toContain('isRouteSupported');
  });
});
