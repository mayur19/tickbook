import pg from 'pg';

// int8 (bigint) columns: convert to number, refusing values that would lose precision.
pg.types.setTypeParser(20, (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 value ${value} exceeds safe integer range`);
  return n;
});

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export const createPool = (connectionString: string, max = 10): pg.Pool =>
  new pg.Pool({ connectionString, max, application_name: 'tickbook-api' });

/** Runs `fn` inside a transaction, rolling back on any error. */
export const withTransaction = async <T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
