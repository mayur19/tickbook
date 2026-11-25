import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { insertInstrument } from '../src/modules/instruments/instruments.repository.js';
import { reconcile } from '../src/venue/recovery.js';
import {
  authed,
  createContext,
  createFirm,
  login,
  type Firm,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  if (ctx) await ctx.close();
  ctx = await createContext();
  ctx.instruments.set(
    'XYZ',
    await insertInstrument(ctx.pool, {
      symbol: 'XYZ',
      name: 'Second Book',
      currency: 'USD',
      tickSize: 5,
      lotSize: 10,
      maxOrderQty: 10_000,
      referencePrice: 1_000,
      priceBandBps: 2_000,
    }),
  );
  await ctx.rebuild();
});
afterAll(async () => ctx?.close());

const place = (s: Session, accountId: string, body: Record<string, unknown>) =>
  authed(ctx.app, s, 'POST', '/api/v1/orders', { accountId, timeInForce: 'GTC', ...body });

const account = async (pool: TestContext['pool'], id: string) =>
  (await pool.query('SELECT cash_minor, reserved_cash_minor FROM accounts WHERE id = $1', [id]))
    .rows[0];

describe('cross-instrument buying power', () => {
  it('never lets concurrent orders on two symbols from one account commit more than its cash', async () => {
    // Cash 100,000 minor; each order reserves 30,000 (30 x 1,000). At most 3 can rest.
    const firm = await createFirm(ctx.pool, 'Overspend Co', { cash: 100_000 });
    const s = await login(ctx.app, firm.emails.trader);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        place(s, firm.accountId, {
          symbol: i % 2 ? 'TBK' : 'XYZ',
          side: 'buy',
          type: 'limit',
          price: 1_000,
          quantity: 30,
        }),
      ),
    );
    const accepted = results.filter((r) => r.statusCode === 201);
    const refused = results.filter((r) => r.statusCode === 422);
    expect(accepted).toHaveLength(3);
    expect(refused).toHaveLength(9);
    expect(
      refused.every((r) => r.json().error.details.violations.includes('insufficient_buying_power')),
    ).toBe(true);
    const a = await account(ctx.pool, firm.accountId);
    expect(a.reserved_cash_minor).toBe(90_000);
    expect(a.reserved_cash_minor).toBeLessThanOrEqual(a.cash_minor);
    expect(await reconcile(ctx.pool, ctx.venue)).toEqual([]);
  });

  it('releases the reservation on fills at better prices, on cancel, and for IOC remainders', async () => {
    const mm = await createFirm(ctx.pool, 'Reserve MM', {
      cash: 1_000_000,
      positions: { TBK: 1_000 },
      instruments: ctx.instruments,
    });
    const buyer = await createFirm(ctx.pool, 'Reserve Buyer', { cash: 100_000 });
    const sm = await login(ctx.app, mm.emails.trader);
    const sb = await login(ctx.app, buyer.emails.trader);
    await place(sm, mm.accountId, {
      symbol: 'TBK',
      side: 'sell',
      type: 'limit',
      price: 990,
      quantity: 20,
    });

    // Buy 50 @ 1,000: 20 fill at 990, 30 rest at 1,000 -> reserved 30,000, cash 100,000 - 19,800.
    const res = await place(sb, buyer.accountId, {
      symbol: 'TBK',
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 50,
    });
    expect(res.statusCode).toBe(201);
    expect(await account(ctx.pool, buyer.accountId)).toEqual({
      cash_minor: 80_200,
      reserved_cash_minor: 30_000,
    });

    // Seller hits the resting bid for 10: maker reservation drops by 10,000 as cash is spent.
    await place(sm, mm.accountId, {
      symbol: 'TBK',
      side: 'sell',
      type: 'limit',
      price: 1_000,
      quantity: 10,
    });
    expect(await account(ctx.pool, buyer.accountId)).toEqual({
      cash_minor: 70_200,
      reserved_cash_minor: 20_000,
    });

    await authed(ctx.app, sb, 'DELETE', `/api/v1/orders/${res.json().data.order.id}`);
    expect(await account(ctx.pool, buyer.accountId)).toEqual({
      cash_minor: 70_200,
      reserved_cash_minor: 0,
    });

    const ioc = await place(sb, buyer.accountId, {
      symbol: 'XYZ',
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 40,
      timeInForce: 'IOC',
    });
    expect(ioc.json().data.order.status).toBe('cancelled');
    expect((await account(ctx.pool, buyer.accountId)).reserved_cash_minor).toBe(0);
    expect(await reconcile(ctx.pool, ctx.venue)).toEqual([]);
  });
});

describe('unfunded resting makers', () => {
  let mm: Firm;
  let taker: Firm;
  let sm: Session;
  let st: Session;

  beforeEach(async () => {
    mm = await createFirm(ctx.pool, 'Fragile MM', {
      cash: 1_000_000,
      positions: { TBK: 1_000 },
      instruments: ctx.instruments,
    });
    taker = await createFirm(ctx.pool, 'Taker Two', {
      cash: 1_000_000,
      positions: { TBK: 1_000 },
      instruments: ctx.instruments,
    });
    sm = await login(ctx.app, mm.emails.trader);
    st = await login(ctx.app, taker.emails.trader);
  });

  it('cancels a resting sell whose account no longer holds the position, journals it, and matches the next maker', async () => {
    const broken = await place(sm, mm.accountId, {
      symbol: 'TBK',
      side: 'sell',
      type: 'limit',
      price: 1_000,
      quantity: 30,
    });
    const healthy = await place(st, taker.accountId, {
      symbol: 'TBK',
      side: 'sell',
      type: 'limit',
      price: 1_005,
      quantity: 30,
    });
    // Out-of-band change (e.g. an operator correction): the maker's shares are gone.
    await ctx.pool.query('UPDATE positions SET quantity = 0 WHERE account_id = $1', [mm.accountId]);

    const buyer = await createFirm(ctx.pool, 'Buyer Three', { cash: 1_000_000 });
    const sb = await login(ctx.app, buyer.emails.trader);
    const res = await place(sb, buyer.accountId, {
      symbol: 'TBK',
      side: 'buy',
      type: 'limit',
      price: 1_005,
      quantity: 30,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.trades).toEqual([
      { tradeId: 1, price: 1_005, quantity: 30, liquidity: 'taker' },
    ]);

    const cancelled = await authed(
      ctx.app,
      sm,
      'GET',
      `/api/v1/orders/${broken.json().data.order.id}`,
    );
    expect(cancelled.json().data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'insufficient_funds',
      filledQuantity: 0,
    });
    const filled = await authed(
      ctx.app,
      st,
      'GET',
      `/api/v1/orders/${healthy.json().data.order.id}`,
    );
    expect(filled.json().data.status).toBe('filled');

    const journal = await ctx.pool.query(
      "SELECT seq, command->>'kind' AS kind, command->>'reason' AS reason FROM journal ORDER BY seq",
    );
    expect(journal.rows.map((r) => [r.seq, r.kind, r.reason])).toEqual([
      [1, 'place', null],
      [2, 'place', null],
      [3, 'cancel', 'insufficient_funds'],
      [4, 'place', null],
    ]);
    const audit = await ctx.pool.query(
      "SELECT count(*)::int AS n FROM audit_log WHERE action = 'order.cancelled_insufficient_funds'",
    );
    expect(audit.rows[0].n).toBe(1);
    // Replaying the journal yields the same book, cancel reason included.
    await ctx.rebuild();
    expect(await reconcile(ctx.pool, ctx.venue)).toEqual([]);
  });

  it('cancels a resting buy whose cash was withdrawn out of band', async () => {
    const bid = await place(sm, mm.accountId, {
      symbol: 'TBK',
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 30,
    });
    await ctx.pool.query(
      'UPDATE accounts SET reserved_cash_minor = 0, cash_minor = 0 WHERE id = $1',
      [mm.accountId],
    );
    const res = await place(st, taker.accountId, {
      symbol: 'TBK',
      side: 'sell',
      type: 'limit',
      price: 1_000,
      quantity: 30,
      timeInForce: 'IOC',
    });
    expect(res.json().data).toMatchObject({
      trades: [],
      order: { status: 'cancelled', cancelReason: 'ioc_remainder' },
    });
    const got = await authed(ctx.app, sm, 'GET', `/api/v1/orders/${bid.json().data.order.id}`);
    expect(got.json().data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'insufficient_funds',
    });
    expect(await account(ctx.pool, mm.accountId)).toEqual({
      cash_minor: 0,
      reserved_cash_minor: 0,
    });
  });
});
