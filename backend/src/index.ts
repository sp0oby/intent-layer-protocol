import 'dotenv/config';
import {createApp} from './server.js';
import {getPool} from './db/pool.js';
import {pgRepository} from './db/repository.js';

/** Build the runtime API config from process.env. The ETH/Base auction
 *  addresses default to the dev/Anvil zero-address when unset so the
 *  process boots without env vars (for type-only smoke tests); a real
 *  deploy must populate them via .env (see .env.example). */
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
const repo = pgRepository(getPool());
const app = createApp({repo, config: loadApiConfig()});
app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
