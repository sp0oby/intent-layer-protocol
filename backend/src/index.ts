import 'dotenv/config';
import {createServer} from 'node:http';
import {createApp} from './server.js';
import {getPool} from './db/pool.js';
import {pgRepository} from './db/repository.js';
import {publishingRepository} from './db/publishing-repository.js';
import {createEventBus} from './services/event-bus.js';
import {attachWsServer} from './services/ws-server.js';
import {loadRuntimeConfig, startRuntime} from './runtime.js';

/** Build the API config from process.env. The ETH/Base auction addresses
 *  default to empty when unset so the process boots without env vars (for
 *  type-only smoke tests); a real deploy must populate them via .env. */
function loadApiConfig() {
  const ethChainId = Number(process.env.ETH_CHAIN_ID ?? 1);
  const baseChainId = Number(process.env.BASE_CHAIN_ID ?? 8453);
  const ethAuction = process.env.ETH_SOLVER_AUCTION_ADDRESS ?? process.env.SOLVER_AUCTION_ADDRESS ?? '';
  const baseAuction = process.env.BASE_SOLVER_AUCTION_ADDRESS ?? process.env.SOLVER_AUCTION_ADDRESS ?? '';
  const solverAuctionByChain: Record<number, string> = {};
  if (ethAuction) solverAuctionByChain[ethChainId] = ethAuction;
  if (baseAuction) solverAuctionByChain[baseChainId] = baseAuction;
  return {solverAuctionByChain};
}

const port = Number(process.env.API_PORT ?? 4000);
const bus = createEventBus();
// publishingRepository wraps pgRepository so DB writes also fan out to
// the WebSocket subscribers via the bus. Both the API (synchronous reads
// + proposal ingest) and the indexer (event-driven writes) share this
// repo; events flow only on the write side.
const repo = publishingRepository(pgRepository(getPool()), bus);
const app = createApp({repo, config: loadApiConfig()});

const httpServer = createServer(app);
attachWsServer(httpServer, bus);

const runtimeConfig = loadRuntimeConfig();
const runtime = startRuntime(runtimeConfig, {repo});

httpServer.listen(port, () => {
  console.log(`API + WS listening on ${port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`received ${signal} — shutting down`);
  await runtime.stop();
  httpServer.close(() => process.exit(0));
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
