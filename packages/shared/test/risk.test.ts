import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  checkPreTrade,
  estimateSweepNotional,
  exposureOf,
  initialState,
  orderNotional,
  type AccountRiskState,
  type NewOrder,
  type RiskLimits,
} from '../src/index.js';
import { SPEC, limit } from './fixtures.js';

const limits: RiskLimits = { maxOrderNotional: 1_000_000, priceBandBps: 1000, maxPosition: 500 };
const flat: AccountRiskState = {
  cash: 100_000,
  reservedCash: 0,
  position: 0,
  exposure: { buyNotional: 0, buyQty: 0, sellQty: 0 },
};

const bookWith = (...cmds: ReturnType<typeof limit>[]) =>
  cmds.reduce((s, c) => applyCommand(SPEC, s, c).state, initialState('TBK')).book;

const buy = (price: number | undefined, quantity: number): NewOrder => ({
  orderId: 'n',
  accountId: 'me',
  side: 'buy',
  type: price === undefined ? 'market' : 'limit',
  tif: price === undefined ? 'IOC' : 'GTC',
  ...(price === undefined ? {} : { price }),
  quantity,
});

describe('exposure and notional', () => {
  it('sums resting exposure for one account only', () => {
    const book = bookWith(
      limit('buy', 100, 10, { accountId: 'me' }),
      limit('buy', 95, 20, { accountId: 'me' }),
      limit('buy', 95, 20, { accountId: 'other' }),
      limit('sell', 120, 30, { accountId: 'me' }),
    );
    expect(exposureOf(book, 'me')).toEqual({ buyNotional: 1000 + 1900, buyQty: 30, sellQty: 30 });
  });

  it('estimates sweep notional with and without a limit', () => {
    const book = bookWith(limit('sell', 100, 10), limit('sell', 110, 10), limit('buy', 90, 10));
    expect(estimateSweepNotional(book, 'buy', 15, null)).toEqual({
      quantity: 15,
      notional: 1000 + 550,
    });
    expect(estimateSweepNotional(book, 'buy', 30, 100)).toEqual({ quantity: 10, notional: 1000 });
    expect(estimateSweepNotional(book, 'sell', 30, 95)).toEqual({ quantity: 0, notional: 0 });
    expect(orderNotional(buy(undefined, 20), book)).toBe(2100);
    expect(orderNotional(buy(100, 20), book)).toBe(2000);
  });
});

describe('checkPreTrade', () => {
  const book = bookWith(limit('sell', 100, 1000, { accountId: 'mm' }));

  it('passes a sane order', () => {
    expect(
      checkPreTrade({ order: buy(100, 10), book, referencePrice: 100, account: flat, limits }),
    ).toEqual([]);
  });

  it('flags fat-finger prices outside the band', () => {
    const r = checkPreTrade({
      order: buy(150, 10),
      book,
      referencePrice: 100,
      account: flat,
      limits,
    });
    expect(r).toContain('price_band_exceeded');
    expect(
      checkPreTrade({ order: buy(150, 10), book, referencePrice: null, account: flat, limits }),
    ).not.toContain('price_band_exceeded');
  });

  it('flags notional above the per-order maximum', () => {
    const r = checkPreTrade({
      order: buy(100, 400),
      book,
      referencePrice: 100,
      account: { ...flat, cash: 10_000_000 },
      limits: { ...limits, maxOrderNotional: 10_000 },
    });
    expect(r).toEqual(['notional_above_max']);
  });

  it('flags insufficient buying power including existing reservations', () => {
    const r = checkPreTrade({
      order: buy(100, 100),
      book,
      referencePrice: 100,
      account: { ...flat, cash: 15_000, reservedCash: 6_000 },
      limits,
    });
    expect(r).toEqual(['insufficient_buying_power']);
  });

  it('flags position limit breaches counting open buys', () => {
    const r = checkPreTrade({
      order: buy(100, 100),
      book,
      referencePrice: 100,
      account: {
        ...flat,
        cash: 1_000_000,
        position: 300,
        exposure: { buyNotional: 0, buyQty: 150, sellQty: 0 },
      },
      limits,
    });
    expect(r).toEqual(['position_limit_exceeded']);
  });

  it('blocks sells beyond the unencumbered position (no short selling)', () => {
    const sell: NewOrder = { ...buy(100, 50), side: 'sell' };
    const account = { ...flat, position: 80, exposure: { buyNotional: 0, buyQty: 0, sellQty: 40 } };
    expect(checkPreTrade({ order: sell, book, referencePrice: 100, account, limits })).toEqual([
      'insufficient_position',
    ]);
    expect(
      checkPreTrade({
        order: { ...sell, quantity: 40 },
        book,
        referencePrice: 100,
        account,
        limits,
      }),
    ).toEqual([]);
  });
});
