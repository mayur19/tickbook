import { describe, expect, it } from 'vitest';
import {
  initialMarket,
  marketReducer,
  seedTrades,
  TAPE_LENGTH,
} from '../src/hooks/market-state.js';

const snap = {
  type: 'snapshot' as const,
  symbol: 'TBK',
  seq: 5,
  bids: [{ price: 100, quantity: 10, orders: 1 }],
  asks: [],
};

describe('marketReducer', () => {
  it('applies a snapshot then newer depth updates, ignoring stale ones', () => {
    let s = marketReducer(initialMarket('TBK'), snap);
    expect(s).toMatchObject({ ready: true, seq: 5 });
    s = marketReducer(s, {
      type: 'depth',
      symbol: 'TBK',
      seq: 4,
      updates: [{ side: 'buy', price: 100, quantity: 0, orders: 0 }],
    });
    expect(s.depth.bids).toHaveLength(1);
    s = marketReducer(s, {
      type: 'depth',
      symbol: 'TBK',
      seq: 6,
      updates: [{ side: 'sell', price: 105, quantity: 7, orders: 1 }],
    });
    expect(s.depth.asks).toEqual([{ price: 105, quantity: 7, orders: 1 }]);
    expect(s.seq).toBe(6);
  });

  it('ignores depth before the first snapshot and other symbols', () => {
    const s0 = initialMarket('TBK');
    expect(marketReducer(s0, { type: 'depth', symbol: 'TBK', seq: 1, updates: [] })).toBe(s0);
    expect(marketReducer(s0, { ...snap, symbol: 'ACME' })).toBe(s0);
  });

  it('prepends trades, de-duplicates and caps the tape', () => {
    let s = initialMarket('TBK');
    for (let i = 1; i <= TAPE_LENGTH + 5; i += 1) {
      s = marketReducer(s, {
        type: 'trade',
        symbol: 'TBK',
        seq: i,
        tradeId: i,
        price: 100,
        quantity: 1,
        aggressorSide: 'buy',
        ts: 't',
      });
    }
    s = marketReducer(s, {
      type: 'trade',
      symbol: 'TBK',
      seq: 99,
      tradeId: TAPE_LENGTH + 5,
      price: 1,
      quantity: 1,
      aggressorSide: 'buy',
      ts: 't',
    });
    expect(s.trades).toHaveLength(TAPE_LENGTH);
    expect(s.trades[0]?.tradeId).toBe(TAPE_LENGTH + 5);
    expect(s.trades[0]?.price).toBe(100);
  });

  it('merges historical trades below live ones', () => {
    const live = marketReducer(initialMarket('TBK'), {
      type: 'trade',
      symbol: 'TBK',
      seq: 9,
      tradeId: 9,
      price: 1,
      quantity: 1,
      aggressorSide: 'buy',
      ts: 't',
    });
    const merged = seedTrades(live, [
      { tradeId: 9, price: 1, quantity: 1, aggressorSide: 'buy', ts: 't' },
      { tradeId: 3, price: 1, quantity: 1, aggressorSide: 'sell', ts: 't' },
    ]);
    expect(merged.trades.map((t) => t.tradeId)).toEqual([9, 3]);
  });
});
