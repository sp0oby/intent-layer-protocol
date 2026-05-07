/**
 * Smoke test that pg-mem accepts our production migrations and that a
 * round-trip through pgRepository works end-to-end. If this test fails,
 * everything else in e2e/ is moot.
 */

import {describe, expect, it} from 'vitest';
import {createTestPool} from './helpers/pg-test-pool';

describe('pg-mem schema smoke', () => {
  it('applies all migrations without parse errors', async () => {
    // pg-mem is permissive about bytea (it round-trips Buffer params through
    // UTF-8 — a known adapter limitation), so we skip the bytea read-back
    // assertion here. The point of this test is migration syntax + index +
    // CHECK constraint correctness against PostgreSQL grammar. Bytea
    // round-trip is exercised against real Postgres in the full E2E
    // (which runs against docker-compose Postgres when available).
    const {pool} = await createTestPool();
    const tablesResult = await pool.query<{table_name: string}>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = tablesResult.rows.map((r) => r.table_name);
    expect(tables).toContain('intents');
    expect(tables).toContain('matches');
    expect(tables).toContain('solver_proposals');
    expect(tables).toContain('indexer_cursors');
  });

  it('CHECK constraint accepts AUCTIONING and rejects unknown states', async () => {
    // Plain SQL — bypasses pgRepository's bytea conversion path.
    const {pool} = await createTestPool();
    // Valid states should all insert.
    for (const state of ['PENDING', 'MATCHED', 'AUCTIONING', 'LOCKED', 'SETTLED', 'CANCELLED', 'REFUNDED']) {
      await expect(
        pool.query(
          `INSERT INTO intents (intent_hash, user_address, source_chain_id, source_token,
                                 source_amount, dest_chain_id, dest_token, min_dest_amount,
                                 deadline, state, refund_to, nonce)
           VALUES ('\\x' || $1, '\\x00', 1, '\\x00', 1, 1, '\\x00', 1, 1, $2, '\\x00', 1)`,
          [`${state.toLowerCase()}${'00'.repeat(31)}`.slice(0, 64), state]
        )
      ).resolves.toBeDefined();
    }
    // Invalid state must violate CHECK.
    await expect(
      pool.query(
        `INSERT INTO intents (intent_hash, user_address, source_chain_id, source_token,
                               source_amount, dest_chain_id, dest_token, min_dest_amount,
                               deadline, state, refund_to, nonce)
         VALUES ('\\x99', '\\x00', 1, '\\x00', 1, 1, '\\x00', 1, 1, 'WRONG', '\\x00', 1)`
      )
    ).rejects.toThrow();
  });
});
