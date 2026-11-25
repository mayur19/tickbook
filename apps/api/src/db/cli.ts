import { loadConfig } from '../config/env.js';
import { migrate, resetSchema } from './migrate.js';
import { createPool } from './pool.js';
import { seed } from './seed.js';

const run = async (command: string | undefined): Promise<void> => {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL, 2);
  try {
    if (command === 'migrate') {
      const { applied, skipped } = await migrate(pool);
      console.warn(
        `migrations applied: ${applied.join(', ') || 'none'} (already applied: ${skipped.length})`,
      );
    } else if (command === 'seed') {
      if (config.isProduction)
        throw new Error('Refusing to load public demo accounts into production');
      const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
      if ((rows[0]?.n ?? 0) > 0) {
        console.warn('database already has users; skipping seed (use reset to start over)');
      } else {
        await seed(pool);
        console.warn('demo data seeded');
      }
    } else if (command === 'reset') {
      if (config.isProduction) throw new Error('Refusing to reset a production database');
      await resetSchema(pool);
      await migrate(pool);
      await seed(pool);
      console.warn('database reset, migrated and seeded');
    } else {
      throw new Error('usage: cli.ts <migrate|seed|reset>');
    }
  } finally {
    await pool.end();
  }
};

run(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
