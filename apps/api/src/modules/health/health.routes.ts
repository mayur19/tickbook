import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.js';
import { ok } from '../../http/envelope.js';
import { AppError } from '../../http/errors.js';

export const registerHealthRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/health', async () => ok({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  app.get('/ready', async () => {
    try {
      await deps.pool.query('SELECT 1');
    } catch {
      throw new AppError(503, 'NOT_READY', 'Database is not reachable');
    }
    return ok({ status: 'ready', instruments: deps.venue.symbols().length });
  });
};
