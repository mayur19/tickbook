import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.js';
import { requirePermission } from '../../http/auth-context.js';
import { ok } from '../../http/envelope.js';
import { listAccounts, listPositions } from './accounts.repository.js';

export const registerAccountRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/v1/accounts', async (req) => {
    const auth = requirePermission(req, 'accounts:read');
    const accounts = await listAccounts(deps.pool, auth.organizationId);
    const positions = await listPositions(
      deps.pool,
      accounts.map((a) => a.id),
    );
    return ok(
      accounts.map((a) => {
        const reserved = deps.venue.reservedCash(a.id);
        return {
          ...a,
          reservedCashMinor: reserved,
          availableCashMinor: a.cashMinor - reserved,
          positions: positions
            .filter((p) => p.accountId === a.id)
            .map((p) => ({ symbol: p.symbol, quantity: p.quantity })),
        };
      }),
    );
  });
};
