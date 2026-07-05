import { Pool, PoolConfig, QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized. Call initPostgres() first.');
  }
  return pool;
}

export async function initPostgres(): Promise<Pool> {
  if (pool) return pool;

  const poolConfig: PoolConfig = {
    connectionString: config.postgres.url,
    max: config.postgres.maxPool,
    idleTimeoutMillis: config.postgres.idleTimeoutMs,
    connectionTimeoutMillis: config.postgres.connectionTimeoutMs,
  };

  pool = new Pool(poolConfig);

  pool.on('connect', () => {
    logger.debug('New PostgreSQL client connected');
  });

  pool.on('error', (err: Error) => {
    logger.error({ err }, 'Unexpected PostgreSQL pool error');
  });

  // Verify connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL pool initialized successfully');
  } finally {
    client.release();
  }

  return pool;
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;

  logger.info('Closing PostgreSQL pool');
  await pool.end();
  pool = null;
  logger.info('PostgreSQL pool closed');
}

export async function healthCheckPostgres(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
  if (!pool) return { status: 'down' };

  try {
    const start = Date.now();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch {
    return { status: 'down' };
  }
}

export async function query<T>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const p = getPostgresPool();
  const result = await p.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(
  text: string,
  params?: unknown[]
): Promise<number> {
  const p = getPostgresPool();
  const result = await p.query(text, params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(
  fn: (query: (text: string, params?: unknown[]) => Promise<any>) => Promise<T>
): Promise<T> {
  const p = getPostgresPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client.query.bind(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
