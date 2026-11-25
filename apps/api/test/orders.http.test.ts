import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
let maker: Firm;
let taker: Firm;
let mk: Session;
let tk: Session;

beforeEach(async () => {
  if (ctx) await ctx.close();
  ctx = await createContext();
  maker = await createFirm(ctx.pool, 'Maker Desk', {
    cash: 50_000_000,
    positions: { TBK: 5_000 },
    instruments: ctx.instruments,
  });
  taker = await createFirm(ctx.pool, 'Taker Fund', {
    cash: 1_000_000,
    positions: { TBK: 100 },
    instruments: ctx.instruments,
  });
  mk = await login(ctx.app, maker.emails.trader);
  tk = await login(ctx.app, taker.emails.trader);
});
afterAll(async () => ctx?.close());

const place = (s: Session, accountId: string, body: Record<string, unknown>) =>
  authed(ctx.app, s, 'POST', '/api/v1/orders', {
    accountId,
    symbol: 'TBK',
    timeInForce: 'GTC',
    ...body,
  });

const cashOf = async (s: Session) =>
  (await authed(ctx.app, s, 'GET', '/api/v1/accounts')).json().data[0];

describe('placing orders', () => {
  it('rests a limit order and shows it in the L2 book', async () => {
    const res = await place(mk, maker.accountId, {
      side: 'sell',
      type: 'limit',
      price: 1_010,
      quantity: 100,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.order).toMatchObject({
      status: 'new',
      remainingQuantity: 100,
      journalSeq: 1,
    });
    const book = await authed(ctx.app, tk, 'GET', '/api/v1/instruments/TBK/book?depth=5');
    expect(book.json().data).toEqual({
      symbol: 'TBK',
      seq: 1,
      bids: [],
      asks: [{ price: 1_010, quantity: 100, orders: 1 }],
    });
  });

  it('matches across firms at the maker price and settles cash and positions', async () => {
    const ask = await place(mk, maker.accountId, {
      side: 'sell',
      type: 'limit',
      price: 1_000,
      quantity: 60,
    });
    const res = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_020,
      quantity: 100,
    });
    expect(res.statusCode).toBe(201);
    const { order, trades } = res.json().data;
    expect(trades).toHaveLength(1);
    expect(trades[0]).toEqual({ tradeId: 1, price: 1_000, quantity: 60, liquidity: 'taker' });
    expect(JSON.stringify(res.json())).not.toContain(maker.accountId);
    expect(order).toMatchObject({
      status: 'partially_filled',
      filledQuantity: 60,
      filledNotional: 60_000,
      remainingQuantity: 40,
    });

    const makerOrder = await authed(
      ctx.app,
      mk,
      'GET',
      `/api/v1/orders/${ask.json().data.order.id}`,
    );
    expect(makerOrder.json().data).toMatchObject({ status: 'filled', remainingQuantity: 0 });

    const takerAcct = await cashOf(tk);
    expect(takerAcct.cashMinor).toBe(1_000_000 - 60_000);
    expect(takerAcct.reservedCashMinor).toBe(40 * 1_020);
    expect(takerAcct.availableCashMinor).toBe(1_000_000 - 60_000 - 40_800);
    expect(takerAcct.positions).toEqual([{ symbol: 'TBK', quantity: 160 }]);
    const makerAcct = await cashOf(mk);
    expect(makerAcct.cashMinor).toBe(50_000_000 + 60_000);
    expect(makerAcct.positions).toEqual([{ symbol: 'TBK', quantity: 4_940 }]);

    const tape = await authed(ctx.app, tk, 'GET', '/api/v1/instruments/TBK/trades');
    expect(tape.json().data).toEqual([
      expect.objectContaining({ tradeId: 1, price: 1_000, quantity: 60 }),
    ]);
    const instrument = await authed(ctx.app, tk, 'GET', '/api/v1/instruments/TBK');
    expect(instrument.json().data).toMatchObject({
      lastPrice: 1_000,
      quote: { bid: 1_020, ask: null },
    });
  });

  it('cancels the IOC remainder and kills an unfillable FOK without trades', async () => {
    await place(mk, maker.accountId, { side: 'sell', type: 'limit', price: 1_000, quantity: 50 });
    const ioc = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 80,
      timeInForce: 'IOC',
    });
    expect(ioc.json().data.order).toMatchObject({
      status: 'cancelled',
      filledQuantity: 50,
      remainingQuantity: 0,
      cancelReason: 'ioc_remainder',
    });
    await place(mk, maker.accountId, { side: 'sell', type: 'limit', price: 1_005, quantity: 50 });
    const fok = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_005,
      quantity: 80,
      timeInForce: 'FOK',
    });
    expect(fok.json().data).toMatchObject({
      trades: [],
      order: { status: 'cancelled', cancelReason: 'fok_unfillable', filledQuantity: 0 },
    });
  });

  it('executes market orders against the book', async () => {
    await place(mk, maker.accountId, { side: 'buy', type: 'limit', price: 990, quantity: 30 });
    await place(mk, maker.accountId, { side: 'buy', type: 'limit', price: 980, quantity: 30 });
    const res = await place(tk, taker.accountId, {
      side: 'sell',
      type: 'market',
      quantity: 50,
      timeInForce: 'IOC',
    });
    expect(res.json().data.trades.map((t: { price: number }) => t.price)).toEqual([990, 980]);
    expect(res.json().data.order.status).toBe('filled');
  });

  it('rejects orders that violate instrument rules (and journals them)', async () => {
    const res = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_001,
      quantity: 10,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'ORDER_REJECTED',
      details: { reason: 'price_not_tick_multiple' },
    });
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM journal');
    expect(rows[0].n).toBe(1);
  });

  it('applies pre-trade risk checks and records the rejection without journaling', async () => {
    const tooBig = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 2_000,
    });
    expect(tooBig.statusCode).toBe(422);
    expect(tooBig.json().error).toMatchObject({
      code: 'RISK_REJECTED',
      details: { violations: ['insufficient_buying_power'] },
    });
    const fatFinger = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_500,
      quantity: 10,
    });
    expect(fatFinger.json().error.details.violations).toContain('price_band_exceeded');
    const shortSale = await place(tk, taker.accountId, {
      side: 'sell',
      type: 'limit',
      price: 1_000,
      quantity: 200,
    });
    expect(shortSale.json().error.details.violations).toEqual(['insufficient_position']);
    const orders = await authed(ctx.app, tk, 'GET', '/api/v1/orders?status=closed');
    expect(orders.json().data.every((o: { status: string }) => o.status === 'rejected')).toBe(true);
    expect(orders.json().meta.count).toBe(3);
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM journal');
    expect(rows[0].n).toBe(0);
  });

  it('counts open buy orders against buying power', async () => {
    const first = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 600,
    });
    expect(first.statusCode).toBe(201);
    const second = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 600,
    });
    expect(second.json().error.details.violations).toContain('insufficient_buying_power');
  });

  it('answers 501 with a ticket for order types that are not built yet', async () => {
    const res = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'stop',
      stopPrice: 1_100,
      quantity: 10,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toEqual({
      code: 'NOT_IMPLEMENTED',
      message: expect.any(String),
      details: { ticket: 'TB-201' },
    });
  });

  it('enforces tenancy, permissions and input rules', async () => {
    const foreign = await place(tk, maker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 1_000,
      quantity: 10,
    });
    expect(foreign.statusCode).toBe(404);
    const viewer = await login(ctx.app, taker.emails.viewer);
    expect(
      (
        await place(viewer, taker.accountId, {
          side: 'buy',
          type: 'limit',
          price: 1_000,
          quantity: 10,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await place(tk, taker.accountId, { side: 'buy', type: 'limit', quantity: 10 })).json().error
        .code,
    ).toBe('PRICE_REQUIRED');
    expect(
      (
        await authed(ctx.app, tk, 'POST', '/api/v1/orders', {
          accountId: taker.accountId,
          symbol: 'NOPE',
          side: 'buy',
          type: 'market',
          timeInForce: 'IOC',
          quantity: 10,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await place(tk, taker.accountId, { side: 'buy', type: 'limit', price: 10.5, quantity: 10 }))
        .statusCode,
    ).toBe(400);
  });

  it('rejects a reused clientOrderId', async () => {
    const body = { side: 'buy', type: 'limit', price: 900, quantity: 10, clientOrderId: 'abc-1' };
    expect((await place(tk, taker.accountId, body)).statusCode).toBe(201);
    const dup = await place(tk, taker.accountId, body);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DUPLICATE_CLIENT_ORDER_ID');
    // The failed command was not installed: the engine and journal stay consistent.
    const book = await authed(ctx.app, tk, 'GET', '/api/v1/instruments/TBK/book');
    expect(book.json().data.bids).toEqual([{ price: 900, quantity: 10, orders: 1 }]);
    expect(book.json().data.seq).toBe(1);
  });

  it('serializes concurrent orders: every command gets a unique, dense sequence', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        place(i % 2 ? mk : tk, i % 2 ? maker.accountId : taker.accountId, {
          side: i % 2 ? 'sell' : 'buy',
          type: 'limit',
          price: 1_000,
          quantity: 10,
        }),
      ),
    );
    const { rows } = await ctx.pool.query('SELECT seq FROM journal ORDER BY seq');
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const trades = await ctx.pool.query('SELECT count(*)::int AS n FROM trades');
    expect(trades.rows[0].n).toBe(10);
  });
});

describe('cancelling orders', () => {
  it('cancels a resting order and frees reserved cash', async () => {
    const placed = await place(tk, taker.accountId, {
      side: 'buy',
      type: 'limit',
      price: 950,
      quantity: 100,
    });
    const id = placed.json().data.order.id;
    expect((await cashOf(tk)).reservedCashMinor).toBe(95_000);
    const res = await authed(ctx.app, tk, 'DELETE', `/api/v1/orders/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'user_requested',
      remainingQuantity: 0,
    });
    expect((await cashOf(tk)).reservedCashMinor).toBe(0);
    const again = await authed(ctx.app, tk, 'DELETE', `/api/v1/orders/${id}`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ORDER_NOT_OPEN');
  });

  it('hides other firms orders', async () => {
    const placed = await place(mk, maker.accountId, {
      side: 'sell',
      type: 'limit',
      price: 1_050,
      quantity: 10,
    });
    const id = placed.json().data.order.id;
    expect((await authed(ctx.app, tk, 'DELETE', `/api/v1/orders/${id}`)).statusCode).toBe(404);
    expect((await authed(ctx.app, tk, 'GET', `/api/v1/orders/${id}`)).statusCode).toBe(404);
    expect((await authed(ctx.app, tk, 'GET', '/api/v1/orders/not-a-uuid')).statusCode).toBe(400);
  });

  it('lists open orders filtered by symbol', async () => {
    await place(tk, taker.accountId, { side: 'buy', type: 'limit', price: 950, quantity: 10 });
    await place(tk, taker.accountId, { side: 'buy', type: 'limit', price: 1_001, quantity: 10 });
    const open = await authed(ctx.app, tk, 'GET', '/api/v1/orders?status=open&symbol=tbk');
    expect(open.json().data).toHaveLength(1);
    const all = await authed(ctx.app, tk, 'GET', '/api/v1/orders');
    expect(all.json().data).toHaveLength(2);
    const list = await authed(ctx.app, tk, 'GET', '/api/v1/instruments');
    expect(list.json().data[0]).toMatchObject({
      symbol: 'TBK',
      tickSize: 5,
      quote: { bid: 950, ask: null },
    });
  });
});
