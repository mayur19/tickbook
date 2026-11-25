import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  initialState,
  orderDeltas,
  settlementDeltas,
  type EngineEvent,
} from '../src/index.js';
import { SPEC, cancel, limit, market } from './fixtures.js';

describe('orderDeltas', () => {
  it('tracks taker and maker fills, notional and terminal status', () => {
    const s1 = applyCommand(
      SPEC,
      initialState('TBK'),
      limit('sell', 100, 30, { orderId: 'm1', accountId: 's' }),
    );
    const s2 = applyCommand(
      SPEC,
      s1.state,
      limit('sell', 105, 30, { orderId: 'm2', accountId: 's' }),
    );
    const r = applyCommand(SPEC, s2.state, limit('buy', 105, 50, { orderId: 't', accountId: 'b' }));
    const d = orderDeltas(r.events);
    expect(d.get('t')).toMatchObject({
      filledQty: 50,
      filledNotional: 30 * 100 + 20 * 105,
      remaining: 0,
      status: 'filled',
    });
    expect(d.get('m1')).toMatchObject({ filledQty: 30, remaining: 0, status: 'filled' });
    expect(d.get('m2')).toMatchObject({ filledQty: 20, remaining: 10, status: 'partially_filled' });
  });

  it('marks rested, rejected and cancelled orders', () => {
    const rested = orderDeltas(
      applyCommand(SPEC, initialState('TBK'), limit('buy', 100, 10, { orderId: 'r' })).events,
    );
    expect(rested.get('r')).toMatchObject({ status: 'new', remaining: 10, filledQty: 0 });
    const rejected = orderDeltas(
      applyCommand(SPEC, initialState('TBK'), limit('buy', 101, 10, { orderId: 'x' })).events,
    );
    expect(rejected.get('x')).toMatchObject({
      status: 'rejected',
      rejectReason: 'price_not_tick_multiple',
      remaining: 0,
    });
    const cancelled = orderDeltas(
      applyCommand(SPEC, initialState('TBK'), market('buy', 10, { orderId: 'c' })).events,
    );
    expect(cancelled.get('c')).toMatchObject({
      status: 'cancelled',
      cancelReason: 'market_no_liquidity',
    });
    const s = applyCommand(
      SPEC,
      initialState('TBK'),
      limit('buy', 100, 10, { orderId: 'k' }),
    ).state;
    const unknown = orderDeltas(applyCommand(SPEC, s, cancel('zzz')).events);
    expect(unknown.size).toBe(0);
  });
});

describe('settlementDeltas', () => {
  it('moves cash and position in opposite directions for buyer and seller', () => {
    const events: EngineEvent[] = [
      {
        type: 'trade',
        tradeId: 1,
        price: 100,
        quantity: 10,
        aggressorSide: 'buy',
        makerOrderId: 'm',
        makerAccountId: 'seller',
        takerOrderId: 't',
        takerAccountId: 'buyer',
        makerRemaining: 0,
        takerRemaining: 0,
      },
      {
        type: 'trade',
        tradeId: 2,
        price: 90,
        quantity: 5,
        aggressorSide: 'sell',
        makerOrderId: 'm2',
        makerAccountId: 'buyer',
        takerOrderId: 't2',
        takerAccountId: 'seller',
        makerRemaining: 0,
        takerRemaining: 0,
      },
      { type: 'accepted', orderId: 'z' },
    ];
    const deltas = settlementDeltas(events);
    expect(deltas).toEqual([
      { accountId: 'buyer', cashDelta: -1000 - 450, positionDelta: 15 },
      { accountId: 'seller', cashDelta: 1000 + 450, positionDelta: -15 },
    ]);
    expect(deltas.reduce((s, d) => s + d.cashDelta, 0)).toBe(0);
  });
});
