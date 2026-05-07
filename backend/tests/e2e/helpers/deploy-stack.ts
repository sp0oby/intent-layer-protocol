/**
 * Deploy the Intent Layer Protocol contract stack on a single Anvil chain.
 *
 * Mirrors the wiring in contracts/test/IntentSettler.lz.t.sol but runs
 * via ethers from TypeScript so the E2E test can drive both chains
 * (each as an independent Anvil) without the Foundry harness.
 *
 * Returns deployed addresses + Contract handles bound to the deployer.
 */

import {Contract, ContractFactory, type Signer} from 'ethers';
import {Artifacts} from './artifacts.js';

export interface DeployedStack {
  endpoint: Contract;
  registry: Contract;
  settler: Contract;
  auction: Contract;
  usdc: Contract;
  endpointAddress: string;
  registryAddress: string;
  settlerAddress: string;
  auctionAddress: string;
  usdcAddress: string;
}

export interface DeployStackOptions {
  deployer: Signer;
  ownChainId: number;
  /** EID this chain is registered as with the local MockLzEndpoint. */
  ownEid: number;
  remoteChainId: number;
  /** LayerZero EID assigned to the remote chain in the registry. */
  remoteEid: number;
}

const factory = (artifact: ReturnType<typeof Artifacts.IntentSettler>, signer: Signer): ContractFactory =>
  new ContractFactory(artifact.abi as never, artifact.bytecode, signer);

export async function deployStack(opts: DeployStackOptions): Promise<DeployedStack> {
  // 1. MockLzEndpoint — the LZ wire mock for this chain.
  const endpoint = (await factory(Artifacts.MockLzEndpoint(), opts.deployer).deploy()) as Contract;
  await endpoint.waitForDeployment();

  // 2. ChainPeerRegistry — owner is the deployer for the test.
  const registry = (await factory(Artifacts.ChainPeerRegistry(), opts.deployer).deploy(
    await opts.deployer.getAddress()
  )) as Contract;
  await registry.waitForDeployment();
  await (await registry.setRouteSupported!(opts.ownChainId, opts.remoteChainId, true)).wait();
  await (await registry.setLzEidForChain!(opts.remoteChainId, opts.remoteEid)).wait();

  // 3. IntentSettler — registry + endpoint + delegate (deployer).
  const settler = (await factory(Artifacts.IntentSettler(), opts.deployer).deploy(
    await registry.getAddress(),
    await endpoint.getAddress(),
    await opts.deployer.getAddress()
  )) as Contract;
  await settler.waitForDeployment();

  // 4. Register the OApp with the mock endpoint so MockLzEndpoint.send can
  //    look the EID up by msg.sender.
  await (await endpoint.registerOApp!(opts.ownEid, await settler.getAddress())).wait();

  // 5. SolverAuction — link to settler.
  const auction = (await factory(Artifacts.SolverAuction(), opts.deployer).deploy(
    await settler.getAddress()
  )) as Contract;
  await auction.waitForDeployment();
  await (await settler.setSolverAuction!(await auction.getAddress())).wait();

  // 6. USDC mock for the destination side. Symbol differs per chain so
  //    the test can't accidentally cross-mint. ETH itself is address(0),
  //    no deploy needed.
  const usdc = (await factory(Artifacts.MockERC20(), opts.deployer).deploy('USDC', 'USDC', 6)) as Contract;
  await usdc.waitForDeployment();

  // 7. Pre-fund the settler so it can pay the LZ return-leg fee. The
  //    Stage 3 audit (M-05) requires this for any chain receiving an
  //    EXECUTE_MATCH that needs to send a CONFIRM back.
  await (await opts.deployer.sendTransaction({to: await settler.getAddress(), value: 1_000_000n})).wait();

  return {
    endpoint,
    registry,
    settler,
    auction,
    usdc,
    endpointAddress: await endpoint.getAddress(),
    registryAddress: await registry.getAddress(),
    settlerAddress: await settler.getAddress(),
    auctionAddress: await auction.getAddress(),
    usdcAddress: await usdc.getAddress(),
  };
}

