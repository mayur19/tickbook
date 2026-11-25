import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import type { Pool } from './db/pool.js';
import { registerErrorHandling } from './http/error-handler.js';
import type { LoginThrottle } from './http/login-throttle.js';
import { registerSessionHooks } from './http/session-hooks.js';
import { registerAccountRoutes } from './modules/accounts/accounts.routes.js';
import { registerAuthRoutes, SESSION_COOKIE } from './modules/auth/auth.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerInstrumentRoutes } from './modules/instruments/instruments.routes.js';
import { registerMarketDataSocket } from './modules/marketdata/marketdata.ws.js';
import { registerOrderRoutes } from './modules/orders/orders.routes.js';
import { registerPendingRoutes } from './modules/pending/pending.routes.js';
import type { Venue } from './venue/venue.js';

export interface AppDeps {
  readonly config: AppConfig;
  readonly pool: Pool;
  readonly venue: Venue;
  readonly now?: () => Date;
  /** Injected in tests to control throttling; built from config otherwise. */
  readonly loginThrottle?: LoginThrottle;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const buildApp = async (deps: AppDeps): Promise<FastifyInstance> => {
  const { config } = deps;
  const app = Fastify({
    // Hop counts become a function (same semantics as proxy-addr) to satisfy Fastify's types.
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (
            (hops: number) => (_addr: string, hop: number) =>
              hop < hops
          )(config.trustProxy)
        : config.trustProxy,
    bodyLimit: 64 * 1024,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
            ],
          },
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
    },
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
  });

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });
  registerErrorHandling(app);
  registerSessionHooks(app, {
    pool: deps.pool,
    secret: config.SESSION_SECRET,
    cookieName: SESSION_COOKIE,
  });

  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerInstrumentRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerOrderRoutes(app, deps);
  registerMarketDataSocket(app, deps);
  registerPendingRoutes(app);
  return app;
};
