import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { LoginThrottle } from '../src/http/login-throttle.js';
import { createAccount, setPosition } from '../src/modules/accounts/accounts.repository.js';
import {
  insertMembership,
  insertOrganization,
  insertUser,
} from '../src/modules/auth/user.repository.js';
import { insertInstrument } from '../src/modules/instruments/instruments.repository.js';
import { hashPassword } from '../src/security/password.js';
import { recoverVenue } from '../src/venue/recovery.js';
import type { Venue } from '../src/venue/venue.js';
import { testDatabaseUrl } from './db-url.js';

export const PASSWORD = 'correct-horse-battery';

export const testConfig = (overrides: Record<string, string> = {}): AppConfig =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    SESSION_SECRET: 'test-secret-test-secret-test-secret-0123',
    ...overrides,
  });

let sharedHash: string | null = null;
const passwordHash = async () => (sharedHash ??= await hashPassword(PASSWORD));

export const TABLES = [
  'trades',
  'orders',
  'journal',
  'positions',
  'accounts',
  'instruments',
  'audit_log',
  'sessions',
  'memberships',
  'users',
  'organizations',
];

export const truncateAll = async (pool: Pool): Promise<void> => {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
};

export interface Firm {
  readonly orgId: string;
  readonly accountId: string;
  readonly emails: Record<'owner' | 'trader' | 'viewer', string>;
}

export const createFirm = async (
  pool: Pool,
  name: string,
  opts: {
    cash?: number;
    positions?: Record<string, number>;
    instruments?: Map<string, string>;
  } = {},
): Promise<Firm> => {
  const orgId = await insertOrganization(pool, name);
  const slug = name.toLowerCase().replace(/[^a-z]/g, '');
  const emails = {
    owner: `owner@${slug}.test`,
    trader: `trader@${slug}.test`,
    viewer: `viewer@${slug}.test`,
  };
  for (const role of ['owner', 'trader', 'viewer'] as const) {
    const uid = await insertUser(pool, {
      email: emails[role],
      displayName: `${name} ${role}`,
      passwordHash: await passwordHash(),
    });
    await insertMembership(pool, orgId, uid, role);
  }
  const accountId = await createAccount(pool, {
    organizationId: orgId,
    name: 'Primary',
    cashMinor: opts.cash ?? 10_000_000,
  });
  for (const [symbol, qty] of Object.entries(opts.positions ?? {})) {
    await setPosition(pool, accountId, opts.instruments?.get(symbol) as string, qty);
  }
  return { orgId, accountId, emails };
};

export interface TestContext {
  readonly pool: Pool;
  app: FastifyInstance;
  venue: Venue;
  readonly instruments: Map<string, string>;
  readonly config: AppConfig;
  rebuild(opts?: { loginThrottle?: LoginThrottle }): Promise<void>;
  close(): Promise<void>;
}

/** Fresh database contents + one instrument (TBK, tick 5, lot 10) + an app recovered from it. */
export const createContext = async (
  opts: { loginThrottle?: LoginThrottle; config?: AppConfig } = {},
): Promise<TestContext> => {
  const config = opts.config ?? testConfig();
  const pool = createPool(config.DATABASE_URL, 4);
  await truncateAll(pool);
  const instruments = new Map<string, string>();
  instruments.set(
    'TBK',
    await insertInstrument(pool, {
      symbol: 'TBK',
      name: 'Test Book',
      currency: 'USD',
      tickSize: 5,
      lotSize: 10,
      maxOrderQty: 10_000,
      referencePrice: 1_000,
      priceBandBps: 2_000,
    }),
  );
  const build = async (throttle?: LoginThrottle) => {
    const { venue } = await recoverVenue(pool, 20);
    const app = await buildApp({
      config,
      pool,
      venue,
      ...(throttle ? { loginThrottle: throttle } : {}),
    });
    return { app, venue };
  };
  const first = await build(opts.loginThrottle);
  const ctx: TestContext = {
    pool,
    instruments,
    config,
    app: first.app,
    venue: first.venue,
    async rebuild(o = {}) {
      await ctx.app.close();
      const next = await build(o.loginThrottle);
      ctx.app = next.app;
      ctx.venue = next.venue;
    },
    async close() {
      await ctx.app.close();
      await pool.end();
    },
  };
  return ctx;
};

export interface Session {
  readonly cookie: string;
  readonly csrf: string;
}

const cookieHeader = (res: LightMyRequestResponse): string =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

export const login = async (
  app: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<Session> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode} ${res.body}`);
  return { cookie: cookieHeader(res), csrf: res.json().data.csrfToken };
};

export const authed = (
  app: FastifyInstance,
  session: Session,
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
