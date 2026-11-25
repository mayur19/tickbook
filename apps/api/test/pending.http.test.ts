import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PENDING_ROUTES } from '../src/modules/pending/pending.routes.js';
import {
  authed,
  createContext,
  createFirm,
  login,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let session: Session;

beforeAll(async () => {
  ctx = await createContext();
  const firm = await createFirm(ctx.pool, 'Pending Co');
  session = await login(ctx.app, firm.emails.owner);
});
afterAll(async () => ctx.close());

const concrete = (url: string) =>
  url
    .replace(':id', '00000000-0000-4000-8000-000000000000')
    .replace(':symbol', 'TBK')
    .replace(':userId', '00000000-0000-4000-8000-000000000001');

describe('pending endpoints', () => {
  it.each(PENDING_ROUTES.map((r) => [r.method, r.url, r.ticket] as const))(
    '%s %s answers 501 with %s',
    async (method, url, ticket) => {
      const res = await authed(
        ctx.app,
        session,
        method,
        concrete(url),
        method === 'GET' ? undefined : {},
      );
      expect(res.statusCode).toBe(501);
      expect(res.json()).toEqual({
        data: null,
        error: { code: 'NOT_IMPLEMENTED', message: expect.any(String), details: { ticket } },
      });
    },
  );

  it('still requires authentication before revealing the stub', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/audit-logs' });
    expect(res.statusCode).toBe(401);
  });

  it('every ticket follows the TB-### convention', () => {
    expect(PENDING_ROUTES.every((r) => /^TB-\d{3}$/.test(r.ticket))).toBe(true);
  });
});
