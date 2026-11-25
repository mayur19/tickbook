import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';
import { reconcile, recoverVenue } from './venue/recovery.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const { venue, report } = await recoverVenue(pool, config.DEPTH_PUBLISH_LEVELS);
  const app = await buildApp({ config, pool, venue });
  app.log.info({ report }, 'order books recovered from journal');
  const problems = await reconcile(pool, venue);
  if (problems.length > 0) app.log.warn({ problems }, 'journal and order table disagree');

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
