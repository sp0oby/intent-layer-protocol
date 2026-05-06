import express from 'express';
import {InMemoryOrderBook, type IntentRecord} from './services/matching.js';
import {healthcheckDb} from './db/pool.js';

const book = new InMemoryOrderBook();

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const dbOk = await healthcheckDb();
    res.json({ok: true, database: dbOk});
  });

  app.get('/api/intents/unmatched', (_req, res) => {
    res.json({intents: book.listUnmatched()});
  });

  app.post('/api/intents/mock', (req, res) => {
    const body = req.body as Partial<IntentRecord>;
    if (!body.id || !body.user) {
      res.status(400).json({error: 'id and user required'});
      return;
    }
    const intent: IntentRecord = {
      id: body.id,
      sourceChainId: body.sourceChainId ?? 1,
      destChainId: body.destChainId ?? 8453,
      sourceToken: body.sourceToken ?? '0x0000000000000000000000000000000000000000',
      destToken: body.destToken ?? '0x0000000000000000000000000000000000000000',
      sourceAmount: body.sourceAmount ?? '0',
      minDestAmount: body.minDestAmount ?? '0',
      user: body.user,
      state: 'PENDING',
    };
    book.upsert(intent);
    res.status(201).json({intent});
  });

  app.post('/api/solver/proposals', (req, res) => {
    // Stub: accept signed proposals in a later milestone
    res.status(202).json({accepted: true, proposal: req.body});
  });

  return app;
}
