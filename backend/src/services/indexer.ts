import {JsonRpcProvider} from 'ethers';

export interface IndexerConfig {
  rpcUrl: string;
  contractAddress: string;
}

export class IntentIndexer {
  private readonly config: IndexerConfig;

  constructor(config: IndexerConfig) {
    this.config = config;
  }

  /**
   * Subscribe to `IntentSubmitted` and persist rows — implement next milestone.
   */
  async start(): Promise<void> {
    const provider = new JsonRpcProvider(this.config.rpcUrl);
    await provider.getNetwork();
    void this.config.contractAddress;
  }
}
