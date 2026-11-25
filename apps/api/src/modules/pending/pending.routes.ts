import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../http/auth-context.js';
import { notImplemented } from '../../http/errors.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PendingRoute {
  readonly method: Method;
  readonly url: string;
  readonly ticket: string;
  readonly summary: string;
}

/**
 * Target API surface that is specified in docs/api/openapi.yaml (x-status: pending)
 * but not built yet. Each answers 501 with its backlog ticket so clients and the
 * contract tests can see exactly what is missing.
 */
export const PENDING_ROUTES: readonly PendingRoute[] = [
  {
    method: 'POST',
    url: '/api/v1/orders/:id/replace',
    ticket: 'TB-210',
    summary: 'Cancel/replace (amend) an order',
  },
  {
    method: 'POST',
    url: '/api/v1/orders/mass-cancel',
    ticket: 'TB-211',
    summary: 'Mass cancel by account or symbol',
  },
  {
    method: 'GET',
    url: '/api/v1/orders/:id/fills',
    ticket: 'TB-212',
    summary: 'Execution reports for an order',
  },
  {
    method: 'GET',
    url: '/api/v1/accounts/:id/ledger',
    ticket: 'TB-301',
    summary: 'Double-entry settlement ledger',
  },
  {
    method: 'GET',
    url: '/api/v1/accounts/:id/pnl',
    ticket: 'TB-303',
    summary: 'Realised and unrealised P&L',
  },
  {
    method: 'POST',
    url: '/api/v1/accounts/:id/deposits',
    ticket: 'TB-305',
    summary: 'Simulated cash funding',
  },
  {
    method: 'POST',
    url: '/api/v1/accounts',
    ticket: 'TB-307',
    summary: 'Open an additional trading account',
  },
  {
    method: 'GET',
    url: '/api/v1/fee-schedules',
    ticket: 'TB-310',
    summary: 'Maker/taker fee schedules',
  },
  {
    method: 'PUT',
    url: '/api/v1/fee-schedules/:id',
    ticket: 'TB-310',
    summary: 'Edit a fee schedule',
  },
  {
    method: 'PUT',
    url: '/api/v1/accounts/:id/risk-limits',
    ticket: 'TB-320',
    summary: 'Configure account risk limits',
  },
  {
    method: 'GET',
    url: '/api/v1/instruments/:symbol/candles',
    ticket: 'TB-401',
    summary: 'OHLCV candles',
  },
  {
    method: 'GET',
    url: '/api/v1/instruments/:symbol/quote',
    ticket: 'TB-402',
    summary: 'Level-1 quote with statistics',
  },
  {
    method: 'GET',
    url: '/api/v1/instruments/:symbol/auction',
    ticket: 'TB-521',
    summary: 'Indicative auction price',
  },
  {
    method: 'POST',
    url: '/api/v1/admin/instruments',
    ticket: 'TB-501',
    summary: 'List a new instrument',
  },
  {
    method: 'PATCH',
    url: '/api/v1/admin/instruments/:symbol',
    ticket: 'TB-502',
    summary: 'Edit instrument rules',
  },
  {
    method: 'POST',
    url: '/api/v1/admin/instruments/:symbol/halt',
    ticket: 'TB-510',
    summary: 'Halt trading',
  },
  {
    method: 'POST',
    url: '/api/v1/admin/instruments/:symbol/resume',
    ticket: 'TB-510',
    summary: 'Resume trading',
  },
  {
    method: 'GET',
    url: '/api/v1/admin/circuit-breakers',
    ticket: 'TB-512',
    summary: 'Circuit breaker configuration',
  },
  {
    method: 'POST',
    url: '/api/v1/admin/instruments/:symbol/auction',
    ticket: 'TB-520',
    summary: 'Run opening cross',
  },
  {
    method: 'GET',
    url: '/api/v1/admin/journal/:symbol',
    ticket: 'TB-601',
    summary: 'Browse the command journal',
  },
  {
    method: 'POST',
    url: '/api/v1/admin/snapshots',
    ticket: 'TB-602',
    summary: 'Write an engine snapshot',
  },
  {
    method: 'GET',
    url: '/api/v1/surveillance/alerts',
    ticket: 'TB-701',
    summary: 'Surveillance alerts',
  },
  {
    method: 'GET',
    url: '/api/v1/surveillance/orders',
    ticket: 'TB-702',
    summary: 'Cross-firm order search',
  },
  {
    method: 'GET',
    url: '/api/v1/reports/trade-blotter',
    ticket: 'TB-720',
    summary: 'Trade blotter CSV export',
  },
  { method: 'GET', url: '/api/v1/members', ticket: 'TB-801', summary: 'List organization members' },
  {
    method: 'POST',
    url: '/api/v1/members/invitations',
    ticket: 'TB-801',
    summary: 'Invite a member',
  },
  {
    method: 'PATCH',
    url: '/api/v1/members/:userId',
    ticket: 'TB-802',
    summary: 'Change a member role',
  },
  { method: 'GET', url: '/api/v1/audit-logs', ticket: 'TB-805', summary: 'Search the audit log' },
  { method: 'POST', url: '/api/v1/api-keys', ticket: 'TB-810', summary: 'Issue an API key' },
  {
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    ticket: 'TB-812',
    summary: 'Confirm signup via outbox link',
  },
];

export const registerPendingRoutes = (app: FastifyInstance): void => {
  for (const route of PENDING_ROUTES) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (req) => {
        if (route.ticket !== 'TB-812') requireAuth(req);
        throw notImplemented(`${route.summary} is not implemented yet`, route.ticket);
      },
    });
  }
};
