import express, {type Request, type Response} from 'express';
import {healthcheckDb} from './db/pool.js';
import type {OrderBookRepository} from './db/repository.js';
import type {IntentRecord} from './types/intent.js';
import {verifyProposalSignature} from './services/proposal-verifier.js';

/** Per-chain config the API needs to verify solver proposals against the
 *  on-chain auction contract. The proposalDigest binds chainId + auction
 *  address into the signed payload, so a stale or wrong-chain config makes
 *  every signature look invalid. */
export interface ApiConfig {
  /** Map of chainId -> SolverAuction contract address. */
  solverAuctionByChain: Record<number, string>;
}

export interface ApiDependencies {
  repo: OrderBookRepository;
  config: ApiConfig;
}

interface SerializedIntent {
  intentHash: string;
  user: string;
  refundTo: string;
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: string;
  destChainId: number;
  destToken: string;
  minDestAmount: string;
  deadline: number;
  nonce: string;
  state: string;
  submittedAtBlockTs?: number;
  matchTimestamp?: number;
  auctionDeadline?: number;
}

const serialize = (intent: IntentRecord): SerializedIntent => ({
  intentHash: intent.intentHash,
  user: intent.user,
  refundTo: intent.refundTo,
  sourceChainId: intent.sourceChainId,
  sourceToken: intent.sourceToken,
  sourceAmount: intent.sourceAmount,
  destChainId: intent.destChainId,
  destToken: intent.destToken,
  minDestAmount: intent.minDestAmount,
  deadline: intent.deadline,
  nonce: intent.nonce,
  state: intent.state,
  submittedAtBlockTs: intent.submittedAtBlockTs,
  matchTimestamp: intent.matchTimestamp,
  auctionDeadline: intent.auctionDeadline,
});

interface ProposalRequestBody {
  intentHash?: string;
  solver?: string;
  proposedOutputAmount?: string;
  solverFeeBps?: number;
  signature?: string;
  chainId?: number;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function createApp(deps: ApiDependencies) {
  const {repo, config} = deps;
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req: Request, res: Response) => {
    const dbOk = await healthcheckDb();
    res.json({ok: true, database: dbOk});
  });

  // List match-eligible intents (Pending or Auctioning, not expired).
  // Optional ?chainId filter — without it, returns all chains the matcher
  // is configured for. The matching loop is the canonical reader; this
  // endpoint exposes the same view for solvers and the frontend.
  app.get('/api/intents/unmatched', async (req: Request, res: Response) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const chainIdParam = req.query.chainId;
    const chainIds = chainIdParam ? [Number(chainIdParam)] : Object.keys(config.solverAuctionByChain).map(Number);
    const intents: IntentRecord[] = [];
    for (const chainId of chainIds) {
      if (!Number.isFinite(chainId)) {
        res.status(400).json({error: 'invalid chainId'});
        return;
      }
      const chunk = await repo.listMatchEligible(chainId, nowSec);
      intents.push(...chunk);
    }
    res.json({intents: intents.map(serialize)});
  });

  // List only AUCTIONING intents (the ones solvers should be bidding on).
  // Filtered down from listMatchEligible so the response is small even
  // when there are many PENDING intents the matcher hasn't auction-opened
  // yet.
  app.get('/api/intents/auctioning', async (req: Request, res: Response) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const chainIdParam = req.query.chainId;
    const chainIds = chainIdParam ? [Number(chainIdParam)] : Object.keys(config.solverAuctionByChain).map(Number);
    const intents: IntentRecord[] = [];
    for (const chainId of chainIds) {
      if (!Number.isFinite(chainId)) {
        res.status(400).json({error: 'invalid chainId'});
        return;
      }
      const chunk = await repo.listMatchEligible(chainId, nowSec);
      intents.push(...chunk.filter((intent) => intent.state === 'AUCTIONING'));
    }
    res.json({intents: intents.map(serialize)});
  });

  // History list — every intent submitted by a given user, newest first.
  // Used by the frontend /history page. Pagination via limit + offset
  // query params (limit defaults to 20, capped at 100).
  app.get('/api/intents', async (req: Request, res: Response) => {
    const userParam = req.query.user;
    if (typeof userParam !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(userParam)) {
      res.status(400).json({error: 'user must be a 0x-prefixed 20-byte address'});
      return;
    }
    const limitRaw = Number(req.query.limit ?? 20);
    const offsetRaw = Number(req.query.offset ?? 0);
    if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 100) {
      res.status(400).json({error: 'limit must be 1..100'});
      return;
    }
    if (!Number.isFinite(offsetRaw) || offsetRaw < 0) {
      res.status(400).json({error: 'offset must be a non-negative integer'});
      return;
    }
    // Fetch one extra row to derive a hasMore flag without a COUNT query.
    const rows = await repo.listIntentsByUser(userParam, limitRaw + 1, offsetRaw);
    const hasMore = rows.length > limitRaw;
    res.json({intents: rows.slice(0, limitRaw).map(serialize), hasMore});
  });

  // Single intent by hash. Used by the frontend status page polling fallback.
  app.get('/api/intents/:hash', async (req: Request, res: Response) => {
    const hash = req.params.hash;
    if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
      res.status(400).json({error: 'invalid intent hash'});
      return;
    }
    const intent = await repo.getIntent(hash);
    if (intent === null) {
      res.status(404).json({error: 'intent not found'});
      return;
    }
    res.json({intent: serialize(intent)});
  });

  // Solver proposal ingest. Verifies the signature against the on-chain
  // SolverAuction.proposalDigest and persists. Solvers are still expected
  // to call submitProposal on-chain themselves (the canonical record); the
  // off-chain ingest gives the orchestrator a head-start view of bidders
  // and lets the API return validation errors synchronously.
  app.post('/api/solver/proposals', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ProposalRequestBody;
    if (!isString(body.intentHash) || !isString(body.solver) || !isString(body.signature)) {
      res.status(400).json({error: 'intentHash, solver, signature are required strings'});
      return;
    }
    if (!isString(body.proposedOutputAmount)) {
      res.status(400).json({error: 'proposedOutputAmount must be a decimal string'});
      return;
    }
    if (!isNumber(body.solverFeeBps)) {
      res.status(400).json({error: 'solverFeeBps must be a number'});
      return;
    }
    if (!isNumber(body.chainId)) {
      res.status(400).json({error: 'chainId must be a number'});
      return;
    }
    const auctionAddress = config.solverAuctionByChain[body.chainId];
    if (!auctionAddress) {
      res.status(400).json({error: `no SolverAuction configured for chainId ${body.chainId}`});
      return;
    }

    const result = verifyProposalSignature({
      chainId: body.chainId,
      auctionAddress,
      intentHash: body.intentHash,
      proposedOutputAmount: body.proposedOutputAmount,
      solverFeeBps: body.solverFeeBps,
      solver: body.solver,
      signature: body.signature,
    });
    if (!result.valid) {
      res.status(400).json({error: result.reason ?? 'invalid signature', digest: result.digest});
      return;
    }

    await repo.upsertProposal({
      intentHash: body.intentHash,
      solver: body.solver,
      proposedOutputAmount: body.proposedOutputAmount,
      solverFeeBps: body.solverFeeBps,
      signature: body.signature,
      proposalDigest: result.digest,
    });
    res.status(201).json({accepted: true, digest: result.digest});
  });

  return app;
}
