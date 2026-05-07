/**
 * In-process Postgres-compatible Pool for E2E tests, backed by pg-mem.
 *
 * Why pg-mem: Docker isn't always running on dev machines, and the E2E
 * test should be self-contained. pg-mem emulates Postgres semantics
 * (BYTEA, NUMERIC, ON CONFLICT, CHECK constraints, to_timestamp, etc.)
 * well enough for our schema. The same `pg.Pool` interface our
 * production `pgRepository` consumes is provided by `db.adapters.createPg()`.
 *
 * Drift caveat: pg-mem is not 100% Postgres. If a SQL feature lands in
 * production that pg-mem doesn't model (e.g. window functions, certain
 * extensions), we'll need to switch to a real Docker Postgres. For
 * Stage 4's schema, pg-mem covers everything.
 */

import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newDb, type IMemoryDb} from 'pg-mem';
import type {Pool} from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '..', '..', '..', 'database', 'migrations');

export interface TestPoolHandle {
  pool: Pool;
  db: IMemoryDb;
  /** Drop and re-apply migrations — useful for resetting between test cases. */
  reset: () => Promise<void>;
}

export async function createTestPool(): Promise<TestPoolHandle> {
  const db = newDb({autoCreateForeignKeyIndices: true});

  // pg-mem's PG adapter supplies a Pool that quacks like the real pg Pool.
  const adapters = db.adapters as unknown as {createPg: () => {Pool: new () => Pool}};
  const PgPool = adapters.createPg().Pool;
  const pool = new PgPool();

  // Apply every migration in lexical order — same order Postgres would.
  const apply = async (): Promise<void> => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  };

  await apply();

  return {
    pool,
    db,
    async reset() {
      // pg-mem doesn't have a direct "drop all" — recreate the db.
      // For our test we don't need reset between cases (each test uses
      // its own pool), but expose it for completeness.
      const fresh = await createTestPool();
      Object.assign(this, fresh);
    },
  };
}
