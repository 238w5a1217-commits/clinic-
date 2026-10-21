import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Read connection string strictly from .env
let rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DATABASE_URL environment variable is not defined. Please configure it in your .env file.');
}

// Strip sslmode query param so pg respects ssl: { rejectUnauthorized: false }
rawConnectionString = rawConnectionString.replace(/[?&]sslmode=[^&]+/, '');

const globalForPg = global as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForPg.pgPool ||
  new Pool({
    connectionString: rawConnectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 20, // Max concurrent connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

/**
 * Execute a query directly against the pool
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  const start = Date.now();
  try {
    const res = await pool.query<R>(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error });
    throw error;
  }
}

/**
 * Helper to run a callback inside an atomic database transaction.
 * Automatically executes BEGIN, COMMIT, or ROLLBACK upon error.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED'
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  try {
    const res = await query('SELECT 1 as test');
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('Database connectivity test failed:', err);
    return false;
  }
}
