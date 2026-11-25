import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db/pool.js';
import { findSession } from '../modules/auth/session.repository.js';
import { hashToken, safeEqual } from '../security/tokens.js';
import { AppError } from './errors.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT = new Set(['/api/v1/auth/login', '/api/v1/auth/register']);

/**
 * Resolves the session cookie into `request.auth` on every request, then enforces
 * the CSRF double-submit check (header must equal the session's token) on
 * mutating requests made with a session.
 */
export const registerSessionHooks = (
  app: FastifyInstance,
  opts: { pool: Pool; secret: string; cookieName: string },
): void => {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[opts.cookieName];
    request.auth = token ? await findSession(opts.pool, hashToken(token, opts.secret)) : null;
  });

  app.addHook('preHandler', async (request) => {
    if (!MUTATING.has(request.method) || !request.auth) return;
    if (CSRF_EXEMPT.has(request.routeOptions.url ?? '')) return;
    const header = request.headers['x-csrf-token'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !safeEqual(value, request.auth.csrfToken)) {
      throw new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token');
    }
  });
};
