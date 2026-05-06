import {Pool} from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? '5432'),
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'intent_protocol',
    });
  }
  return pool;
}

export async function healthcheckDb(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query('select 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
