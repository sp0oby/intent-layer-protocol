import express, {type Request, type Response} from 'express';
import {InMemoryOrderBook} from './services/matching.js';
import {healthcheckDb} from './db/pool.js';

/** Process-wide order book. The W4-02 task replaces this with a Postgres-backed
 *  implementation; the surface stays the same so call sites do not change. */
const book = new InMemoryOrderBook();

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req: Request, res: Response) => {
    const dbOk = await healthcheckDb();
    res.json({ok: true, database: dbOk});
  });

  // Read-only view of the current match-eligible book. The indexer (W4-01)
  // populates this from on-chain IntentSubmitted events; the in-memory store
  // is a placeholder until the Postgres-backed reader lands.
  app.get('/api/intents/unmatched', (_req: Request, res: Response) => {
    res.json({intents: book.listUnmatched()});
  });

  // Solver proposal submission. The real handler must:
  //   1. recompute SolverAuction.proposalDigest(intentHash, output, feeBps)
  //   2. recover the signer via ECDSA and compare to msg.sender of an
  //      anticipated on-chain submitProposal — the off-chain endpoint stores
  //      the bid; the solver still calls the contract to make it canonical
  //   3. persist into solver_proposals
  // Wired in W4-04 once the auction orchestrator is live.
  app.post('/api/solver/proposals', (_req: Request, res: Response) => {
    res.status(501).json({error: 'solver proposal endpoint not implemented (Stage 4 / W4-04)'});
  });

  return app;
}

export {book as inMemoryOrderBook};
