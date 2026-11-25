import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createLoginThrottle, DEFAULT_THROTTLE } from '../src/http/login-throttle.js';
import {
  authed,
  createContext,
  createFirm,
  login,
  PASSWORD,
  type Firm,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let firm: Firm;

beforeEach(async () => {
  if (ctx) await ctx.close();
  ctx = await createContext();
  firm = await createFirm(ctx.pool, 'Alpha Fund');
});
afterAll(async () => ctx?.close());

const registration = {
  organizationName: 'Beta Trading',
  displayName: 'Bea',
  email: 'bea@beta.test',
  password: 'a-very-long-password',
};

describe('registration', () => {
  it('creates the firm, owner and a funded account; the user then signs in', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registration,
    });
    expect(res.statusCode).toBe(202);
    expect(res.cookies).toHaveLength(0);
    const session = await login(ctx.app, registration.email, registration.password);
    const me = await authed(ctx.app, session, 'GET', '/api/v1/auth/me');
    expect(me.json().data).toMatchObject({ role: 'owner', organization: { name: 'Beta Trading' } });
    const accounts = await authed(ctx.app, session, 'GET', '/api/v1/accounts');
    expect(accounts.json().data[0]).toMatchObject({ name: 'Primary', cashMinor: 100_000_000 });
  });

  it('does not reveal whether an email is already registered', async () => {
    const fresh = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registration,
    });
    const dup = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registration, email: firm.emails.owner, organizationName: 'Impostor' },
    });
    expect(dup.statusCode).toBe(fresh.statusCode);
    expect(dup.json()).toEqual(fresh.json());
    const { rows } = await ctx.pool.query(
      "SELECT count(*)::int AS n FROM organizations WHERE name = 'Impostor'",
    );
    expect(rows[0].n).toBe(0);
    // The original owner's password still works; the impostor's does not.
    await expect(login(ctx.app, firm.emails.owner, registration.password)).rejects.toThrow(/401/);
    await expect(login(ctx.app, firm.emails.owner)).resolves.toBeDefined();
  });

  it('rate-limits registration per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        remoteAddress: '198.51.100.20',
        payload: { ...registration, email: `r${i}@beta.test` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429, 429]);
  });

  it('validates input', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bad' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('login, session and csrf', () => {
  it('sets HttpOnly session and readable csrf cookies', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: firm.emails.trader, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const session = res.cookies.find((c) => c.name === 'tb_session');
    const csrf = res.cookies.find((c) => c.name === 'tb_csrf');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(csrf?.httpOnly).toBeFalsy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects bad credentials with a generic error', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@x.test', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires authentication and a matching csrf token on mutations', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401);
    const s = await login(ctx.app, firm.emails.owner);
    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: s.cookie },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('CSRF_FAILED');
    const out = await authed(ctx.app, s, 'POST', '/api/v1/auth/logout');
    expect(out.statusCode).toBe(204);
    expect((await authed(ctx.app, s, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('writes audit entries for login and logout', async () => {
    const s = await login(ctx.app, firm.emails.owner);
    await authed(ctx.app, s, 'POST', '/api/v1/auth/logout');
    const { rows } = await ctx.pool.query('SELECT action FROM audit_log ORDER BY id');
    expect(rows.map((r) => r.action)).toEqual(['auth.login', 'auth.logout']);
  });

  it('backs off per email and answers 429 with Retry-After', async () => {
    const throttle = createLoginThrottle({
      ...DEFAULT_THROTTLE,
      ipAttemptsPerWindow: 100,
      emailFreeFailures: 2,
      backoffBaseMs: 60_000,
    });
    await ctx.rebuild({ loginThrottle: throttle });
    const attempt = (password: string, ip: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: ip,
        payload: { email: firm.emails.owner, password },
      });
    expect((await attempt('wrong-1', '203.0.113.1')).statusCode).toBe(401);
    expect((await attempt('wrong-2', '203.0.113.2')).statusCode).toBe(401);
    const locked = await attempt(PASSWORD, '203.0.113.3');
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(locked.json().error.code).toBe('RATE_LIMITED');
  });

  it('counts parallel bad logins before awaiting, so only the allowance gets through', async () => {
    const throttle = createLoginThrottle({
      ...DEFAULT_THROTTLE,
      ipAttemptsPerWindow: 100,
      emailFreeFailures: 3,
      backoffBaseMs: 60_000,
    });
    await ctx.rebuild({ loginThrottle: throttle });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        ctx.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: `192.0.2.${i + 1}`,
          payload: { email: firm.emails.owner, password: `bad-${i}` },
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 401)).toHaveLength(3);
    expect(codes.filter((c) => c === 429)).toHaveLength(9);
  });

  it('limits a single IP spraying many accounts', async () => {
    const throttle = createLoginThrottle({ ...DEFAULT_THROTTLE, ipAttemptsPerWindow: 4 });
    await ctx.rebuild({ loginThrottle: throttle });
    const codes: number[] = [];
    for (const email of [
      firm.emails.owner,
      firm.emails.trader,
      firm.emails.viewer,
      'a@x.test',
      'b@x.test',
    ]) {
      const r = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: '::ffff:203.0.113.50',
        payload: { email, password: 'spray' },
      });
      codes.push(r.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 429]);
  });
});

describe('platform behaviour', () => {
  it('serves health and readiness', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json().data.status).toBe('ok');
    expect((await ctx.app.inject({ method: 'GET', url: '/ready' })).json().data).toEqual({
      status: 'ready',
      instruments: 1,
    });
  });

  it('returns enveloped 404s and echoes safe request ids', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/nope',
      headers: { 'x-request-id': 'req-12345678' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ data: null, error: { code: 'NOT_FOUND' } });
    expect(res.headers['x-request-id']).toBe('req-12345678');
  });

  it('maps malformed JSON to an envelope', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_JSON');
  });
});
