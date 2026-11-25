import { migrate, resetSchema } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { testDatabaseUrl } from './db-url.js';

/** Recreates the test schema once per run so every run starts from the migrations. */
export default async function setup(): Promise<void> {
  const pool = createPool(testDatabaseUrl(), 2);
  try {
    await resetSchema(pool);
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
