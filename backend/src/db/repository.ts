/**
 * Typed write surface for the order book. Every SQL statement the indexer,
 * matching engine, and API need to issue lives here so call sites stay
 * declarative. Schema source of truth: backend/database/migrations/.
 *
 * All bytes-typed columns (intent_hash, user_address, *_token, *_tx_hash,
 * contract_address) are passed in as 0x-prefixed lowercase hex strings on
 * the JS side; the helpers below convert to Buffer for the pg driver.
 *
 * Numeric uint256 columns (source_amount, min_dest_amount, nonce,
 * proposed_output_amount) are passed as decimal strings — pg's NUMERIC
 * type round-trips them losslessly.
 */

import type {Pool, PoolClient, QueryResult} from 'pg';

export interface IntentEventPayload {
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
  submittedAtBlockTs: number;
  submitTxHash: string;
}

export interface MatchEventPayload {
  localHash: string;
  remoteHash: string;
  matchTimestamp: number;
  sourceChainId: number;
  destChainId: number;
  executeMatchTxHash: string;
}

export interface SettleEventPayload {
  intentHash: string;
  settleTxHash: string;
  blockTimestamp: number;
}

export interface RefundEventPayload {
  intentHash: string;
  refundTxHash: string;
  blockTimestamp: number;
}

export interface CancelEventPayload {
  intentHash: string;
  cancelTxHash: string;
}

export interface AuctionOpenedPayload {
  intentHash: string;
  auctionDeadline: number;
}

export interface ProposalEventPayload {
  intentHash: string;
  solver: string;
  proposedOutputAmount: string;
  solverFeeBps: number;
  signature: string;
  proposalDigest?: string;
}

export interface WinnerSelectedPayload {
  intentHash: string;
  solver: string;
}

export interface CursorAdvance {
  chainId: number;
  contractAddress: string;
  lastProcessedBlock: number;
}

/**
 * The narrow surface the indexer / API depend on. The Postgres-backed
 * implementation lives in `pgRepository`; tests inject a fake.
 */
export interface OrderBookRepository {
  insertIntent(payload: IntentEventPayload, client?: PoolClient): Promise<void>;
  markMatched(payload: MatchEventPayload, client?: PoolClient): Promise<void>;
  markCancelled(payload: CancelEventPayload, client?: PoolClient): Promise<void>;
  markSettled(payload: SettleEventPayload, client?: PoolClient): Promise<void>;
  markRefunded(payload: RefundEventPayload, client?: PoolClient): Promise<void>;
  markAuctioning(payload: AuctionOpenedPayload, client?: PoolClient): Promise<void>;
  upsertProposal(payload: ProposalEventPayload, client?: PoolClient): Promise<void>;
  markProposalWinner(payload: WinnerSelectedPayload, client?: PoolClient): Promise<void>;
  readCursor(chainId: number, contractAddress: string): Promise<number | null>;
  advanceCursor(advance: CursorAdvance, client?: PoolClient): Promise<void>;
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

const toBuffer = (hex: string): Buffer => {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(stripped, 'hex');
};

const lower = (hex: string): string => hex.toLowerCase();

export function pgRepository(pool: Pool): OrderBookRepository {
  const exec = async <T>(client: PoolClient | undefined, fn: (c: PoolClient | Pool) => Promise<T>): Promise<T> => {
    if (client) return fn(client);
    return fn(pool);
  };

  return {
    async insertIntent(p, client) {
      await exec(client, (c) =>
        c.query(
          `INSERT INTO intents (
             intent_hash, user_address, source_chain_id, source_token, source_amount,
             dest_chain_id, dest_token, min_dest_amount, deadline, state,
             refund_to, nonce, submitted_at_block_ts, submit_tx_hash
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11,$12,$13
           )
           ON CONFLICT (intent_hash) DO NOTHING`,
          [
            toBuffer(lower(p.intentHash)),
            toBuffer(lower(p.user)),
            p.sourceChainId,
            toBuffer(lower(p.sourceToken)),
            p.sourceAmount,
            p.destChainId,
            toBuffer(lower(p.destToken)),
            p.minDestAmount,
            p.deadline,
            toBuffer(lower(p.refundTo)),
            p.nonce,
            p.submittedAtBlockTs,
            toBuffer(lower(p.submitTxHash)),
          ]
        )
      );
    },

    async markMatched(p, client) {
      await exec(client, async (c) => {
        // The matcher might race with itself across two indexers (Eth + Base)
        // both seeing IntentMatched for the same pair. UPSERT semantics avoid
        // a duplicate-pair row and keep the table idempotent on replay.
        await c.query(
          `UPDATE intents
              SET state = 'MATCHED',
                  match_timestamp = $2
            WHERE intent_hash IN ($1, $3)`,
          [toBuffer(lower(p.localHash)), p.matchTimestamp, toBuffer(lower(p.remoteHash))]
        );
        await c.query(
          `INSERT INTO matches (
             intent_hash_a, intent_hash_b, source_chain_id, dest_chain_id, execute_match_tx_hash
           ) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT DO NOTHING`,
          [
            toBuffer(lower(p.localHash)),
            toBuffer(lower(p.remoteHash)),
            p.sourceChainId,
            p.destChainId,
            toBuffer(lower(p.executeMatchTxHash)),
          ]
        );
      });
    },

    async markCancelled(p, client) {
      await exec(client, (c) =>
        c.query(
          `UPDATE intents
              SET state = 'CANCELLED', cancel_tx_hash = $2
            WHERE intent_hash = $1`,
          [toBuffer(lower(p.intentHash)), toBuffer(lower(p.cancelTxHash))]
        )
      );
    },

    async markSettled(p, client) {
      await exec(client, async (c) => {
        await c.query(
          `UPDATE intents
              SET state = 'SETTLED',
                  settled_at = to_timestamp($2),
                  settle_tx_hash = $3
            WHERE intent_hash = $1`,
          [toBuffer(lower(p.intentHash)), p.blockTimestamp, toBuffer(lower(p.settleTxHash))]
        );
        await c.query(
          `UPDATE matches
              SET settled_at = to_timestamp($2)
            WHERE intent_hash_a = $1 OR intent_hash_b = $1`,
          [toBuffer(lower(p.intentHash)), p.blockTimestamp]
        );
      });
    },

    async markRefunded(p, client) {
      await exec(client, (c) =>
        c.query(
          `UPDATE intents
              SET state = 'REFUNDED',
                  settled_at = to_timestamp($2),
                  settle_tx_hash = $3
            WHERE intent_hash = $1`,
          [toBuffer(lower(p.intentHash)), p.blockTimestamp, toBuffer(lower(p.refundTxHash))]
        )
      );
    },

    async markAuctioning(p, client) {
      await exec(client, (c) =>
        c.query(
          `UPDATE intents
              SET state = 'AUCTIONING', auction_deadline = $2
            WHERE intent_hash = $1
              AND state IN ('PENDING')`,
          [toBuffer(lower(p.intentHash)), p.auctionDeadline]
        )
      );
    },

    async upsertProposal(p, client) {
      await exec(client, (c) =>
        c.query(
          `INSERT INTO solver_proposals (
             intent_hash, solver_address, proposed_output_amount, solver_fee_bps,
             signature, proposal_digest
           ) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`,
          [
            toBuffer(lower(p.intentHash)),
            toBuffer(lower(p.solver)),
            p.proposedOutputAmount,
            p.solverFeeBps,
            toBuffer(p.signature.startsWith('0x') ? p.signature.slice(2) : p.signature),
            p.proposalDigest ? toBuffer(lower(p.proposalDigest)) : null,
          ]
        )
      );
    },

    async markProposalWinner(p, client) {
      await exec(client, (c) =>
        c.query(
          `UPDATE solver_proposals
              SET winner_announced = TRUE,
                  accepted = TRUE
            WHERE intent_hash = $1 AND solver_address = $2`,
          [toBuffer(lower(p.intentHash)), toBuffer(lower(p.solver))]
        )
      );
    },

    async readCursor(chainId, contractAddress) {
      const result: QueryResult<{last_processed_block: string}> = await pool.query(
        `SELECT last_processed_block FROM indexer_cursors
          WHERE chain_id = $1 AND contract_address = $2`,
        [chainId, toBuffer(lower(contractAddress))]
      );
      if (result.rowCount === 0) return null;
      return Number(result.rows[0].last_processed_block);
    },

    async advanceCursor(advance, client) {
      await exec(client, (c) =>
        c.query(
          `INSERT INTO indexer_cursors (chain_id, contract_address, last_processed_block, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (chain_id, contract_address)
             DO UPDATE SET last_processed_block = EXCLUDED.last_processed_block,
                           updated_at = NOW()`,
          [advance.chainId, toBuffer(lower(advance.contractAddress)), advance.lastProcessedBlock]
        )
      );
    },

    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export const __testing = {toBuffer, lower};
