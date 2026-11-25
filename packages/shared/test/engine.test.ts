import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  initialState,
  replay,
  type EngineCommand,
  type EngineEvent,
  type EngineState,
  type TradeEvent,
} from '../src/index.js';
import { SPEC, cancel, limit, market, orderOf } from './fixtures.js';

const run = (cmds: EngineCommand[], from: EngineState = initialState(SPEC.symbol)) => {
  let state = from;
  const events: EngineEvent[] = [];
  for (const cmd of cmds) {
    const result = applyCommand(SPEC, state, cmd);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
};

const trades = (events: readonly EngineEvent[]): TradeEvent[] =>
  events.filter((e): e is TradeEvent => e.type === 'trade');

describe('limit orders', () => {
  it('rests a non-marketable GTC limit order', () => {
    const cmd = limit('buy', 100, 50);
    const { state, events } = run([cmd]);
    expect(events).toEqual([
      { type: 'accepted', orderId: orderOf(cmd).orderId },
      { type: 'rested', orderId: orderOf(cmd).orderId, side: 'buy', price: 100, remaining: 50 },
    ]);
    expect(state.seq).toBe(1);
    expect(state.book.bids[0]).toMatchObject({ price: 100, total: 50 });
  });

  it('matches a crossing limit at the maker price (price improvement for the taker)', () => {
    const ask = limit('sell', 100, 30, { accountId: 'maker' });
    const bid = limit('buy', 110, 30, { accountId: 'taker' });
    const { state, events } = run([ask, bid]);
    const [t] = trades(events);
    expect(t).toMatchObject({
      price: 100,
      quantity: 30,
      aggressorSide: 'buy',
      makerOrderId: orderOf(ask).orderId,
      takerOrderId: orderOf(bid).orderId,
      makerAccountId: 'maker',
      takerAccountId: 'taker',
      makerRemaining: 0,
      takerRemaining: 0,
      tradeId: 1,
    });
    expect(state.book.asks).toEqual([]);
    expect(state.book.bids).toEqual([]);
    expect(state.lastTradeId).toBe(1);
  });

  it('partially fills and rests the remainder', () => {
    const ask = limit('sell', 100, 20);
    const bid = limit('buy', 100, 50);
    const { state, events } = run([ask, bid]);
    expect(trades(events)).toHaveLength(1);
    expect(events.at(-1)).toEqual({
      type: 'rested',
      orderId: orderOf(bid).orderId,
      side: 'buy',
      price: 100,
      remaining: 30,
    });
    expect(state.book.bids[0]?.orders[0]).toMatchObject({ remaining: 30, seq: 2 });
  });

  it('honours price priority, then time priority within a level', () => {
    const a1 = limit('sell', 105, 10);
    const a2 = limit('sell', 100, 10);
    const a3 = limit('sell', 100, 10);
    const a4 = limit('sell', 110, 10);
    const bid = limit('buy', 105, 30);
    const { state, events } = run([a1, a2, a3, a4, bid]);
    expect(trades(events).map((t) => [t.makerOrderId, t.price])).toEqual([
      [orderOf(a2).orderId, 100],
      [orderOf(a3).orderId, 100],
      [orderOf(a1).orderId, 105],
    ]);
    expect(state.book.asks.map((l) => l.price)).toEqual([110]);
  });

  it('leaves a partially filled maker at the front of its queue', () => {
    const a1 = limit('sell', 100, 50);
    const a2 = limit('sell', 100, 10);
    const { state } = run([a1, a2, limit('buy', 100, 20)]);
    const level = state.book.asks[0]!;
    expect(level.orders.map((o) => [o.orderId, o.remaining])).toEqual([
      [orderOf(a1).orderId, 30],
      [orderOf(a2).orderId, 10],
    ]);
    expect(level.total).toBe(40);
  });

  it('sweeps multiple levels on the bid side for a sell', () => {
    const { state, events } = run([
      limit('buy', 100, 10),
      limit('buy', 95, 10),
      limit('buy', 90, 10),
      limit('sell', 95, 30),
    ]);
    expect(trades(events).map((t) => [t.price, t.quantity])).toEqual([
      [100, 10],
      [95, 10],
    ]);
    expect(state.book.asks[0]).toMatchObject({ price: 95, total: 10 });
    expect(state.book.bids.map((l) => l.price)).toEqual([90]);
  });
});

describe('market orders', () => {
  it('sweeps the book and cancels any unfilled remainder', () => {
    const cmd = market('buy', 40);
    const { state, events } = run([limit('sell', 100, 10), limit('sell', 120, 10), cmd]);
    expect(trades(events).map((t) => t.price)).toEqual([100, 120]);
    expect(events.at(-1)).toEqual({
      type: 'cancelled',
      orderId: orderOf(cmd).orderId,
      remaining: 20,
      reason: 'market_no_liquidity',
    });
    expect(state.book.asks).toEqual([]);
    expect(state.book.bids).toEqual([]);
  });

  it('cancels entirely against an empty book', () => {
    const { events } = run([market('sell', 10)]);
    expect(events.map((e) => e.type)).toEqual(['accepted', 'cancelled']);
  });

  it('rejects a GTC market order', () => {
    const { state, events } = run([market('buy', 10, { tif: 'GTC' })]);
    expect(events[0]).toMatchObject({ type: 'rejected', reason: 'invalid_tif_for_market' });
    expect(state.seq).toBe(1);
  });

  it('supports market FOK: all or nothing', () => {
    const killed = run([limit('sell', 100, 10), market('buy', 20, { tif: 'FOK' })]);
    expect(trades(killed.events)).toEqual([]);
    expect(killed.events.at(-1)).toMatchObject({ type: 'cancelled', reason: 'fok_unfillable' });
    const filled = run([
      limit('sell', 100, 10),
      limit('sell', 200, 10),
      market('buy', 20, { tif: 'FOK' }),
    ]);
    expect(trades(filled.events).map((t) => t.quantity)).toEqual([10, 10]);
  });
});

describe('IOC and FOK limit orders', () => {
  it('IOC fills what is available within the limit and cancels the rest', () => {
    const ioc = limit('buy', 105, 50, { tif: 'IOC' });
    const { state, events } = run([limit('sell', 100, 20), limit('sell', 110, 20), ioc]);
    expect(trades(events).map((t) => [t.price, t.quantity])).toEqual([[100, 20]]);
    expect(events.at(-1)).toEqual({
      type: 'cancelled',
      orderId: orderOf(ioc).orderId,
      remaining: 30,
      reason: 'ioc_remainder',
    });
    expect(state.book.bids).toEqual([]);
  });

  it('IOC that fully fills emits no cancel', () => {
    const { events } = run([limit('sell', 100, 20), limit('buy', 100, 20, { tif: 'IOC' })]);
    expect(events.at(-1)).toMatchObject({ type: 'trade', takerRemaining: 0 });
  });

  it('FOK is killed without any fills when liquidity within the limit is short', () => {
    const before = run([limit('sell', 100, 20), limit('sell', 110, 20)]);
    const fok = limit('buy', 105, 30, { tif: 'FOK' });
    const after = applyCommand(SPEC, before.state, fok);
    expect(after.events).toEqual([
      { type: 'accepted', orderId: orderOf(fok).orderId },
      { type: 'cancelled', orderId: orderOf(fok).orderId, remaining: 30, reason: 'fok_unfillable' },
    ]);
    expect(after.state.book).toBe(before.state.book);
    expect(after.state.seq).toBe(before.state.seq + 1);
  });

  it('FOK executes completely across levels when liquidity suffices', () => {
    const { state, events } = run([
      limit('sell', 100, 20),
      limit('sell', 110, 20),
      limit('buy', 110, 30, { tif: 'FOK' }),
    ]);
    expect(trades(events).map((t) => t.quantity)).toEqual([20, 10]);
    expect(state.book.asks[0]).toMatchObject({ price: 110, total: 10 });
  });
});

describe('cancellation and rejection', () => {
  it('cancels a resting order owned by the caller', () => {
    const bid = limit('buy', 100, 10);
    const { state, events } = run([bid, cancel(orderOf(bid).orderId)]);
    expect(events.at(-1)).toEqual({
      type: 'cancelled',
      orderId: orderOf(bid).orderId,
      remaining: 10,
      reason: 'user_requested',
    });
    expect(state.book.bids).toEqual([]);
    expect(state.seq).toBe(2);
  });

  it('refuses to cancel unknown or foreign orders', () => {
    const bid = limit('buy', 100, 10);
    const { state, events } = run([bid, cancel('nope'), cancel(orderOf(bid).orderId, 'intruder')]);
    expect(events.slice(-2)).toEqual([
      { type: 'cancel_rejected', orderId: 'nope', reason: 'unknown_order' },
      { type: 'cancel_rejected', orderId: orderOf(bid).orderId, reason: 'not_owner' },
    ]);
    expect(state.book.bids[0]?.total).toBe(10);
  });

  it('rejects invalid orders but still consumes a sequence number', () => {
    const { state, events } = run([limit('buy', 101, 10)]);
    expect(events).toEqual([
      expect.objectContaining({ type: 'rejected', reason: 'price_not_tick_multiple' }),
    ]);
    expect(state.seq).toBe(1);
    expect(state.book.bids).toEqual([]);
  });

  it('rejects a duplicate id of a resting order', () => {
    const { events } = run([
      limit('buy', 100, 10, { orderId: 'dup' }),
      limit('buy', 95, 10, { orderId: 'dup' }),
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'rejected', reason: 'duplicate_order_id' });
  });
});

describe('determinism', () => {
  it('replay of the journal reproduces the live state exactly', () => {
    const cmds = [
      limit('sell', 100, 20),
      limit('sell', 105, 20),
      limit('buy', 95, 20),
      market('buy', 30),
      limit('buy', 105, 20, { tif: 'IOC' }),
    ];
    const live = run(cmds).state;
    expect(replay(SPEC, cmds)).toEqual(live);
    const partial = replay(SPEC, cmds.slice(0, 2));
    expect(replay(SPEC, cmds.slice(2), partial)).toEqual(live);
  });
});
