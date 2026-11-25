import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allResting,
  applyCommand,
  initialState,
  replay,
  type EngineCommand,
  type EngineEvent,
  type EngineState,
  type OrderBook,
  type PriceLevel,
} from '../src/index.js';
import { commandStream } from './arbitraries.js';
import { SPEC } from './fixtures.js';
import { referenceRun } from './reference-model.js';

const RUNS = 300;

const runAll = (cmds: readonly EngineCommand[]) => {
  let state: EngineState = initialState(SPEC.symbol);
  const events: EngineEvent[] = [];
  const states: EngineState[] = [];
  for (const cmd of cmds) {
    const r = applyCommand(SPEC, state, cmd);
    state = r.state;
    events.push(...r.events);
    states.push(state);
  }
  return { state, events, states };
};

const assertLevelsWellFormed = (levels: readonly PriceLevel[], descending: boolean): void => {
  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i]!;
    expect(level.orders.length).toBeGreaterThan(0);
    expect(level.total).toBe(level.orders.reduce((s, o) => s + o.remaining, 0));
    for (const o of level.orders) {
      expect(o.remaining).toBeGreaterThan(0);
      expect(o.price).toBe(level.price);
    }
    for (let j = 1; j < level.orders.length; j += 1) {
      expect(level.orders[j]!.seq).toBeGreaterThan(level.orders[j - 1]!.seq);
    }
    if (i > 0) {
      const prev = levels[i - 1]!.price;
      expect(descending ? prev > level.price : prev < level.price).toBe(true);
    }
  }
};

const assertBookInvariants = (book: OrderBook): void => {
  assertLevelsWellFormed(book.bids, true);
  assertLevelsWellFormed(book.asks, false);
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid !== undefined && ask !== undefined) expect(bid).toBeLessThan(ask);
};

describe('matching engine properties', () => {
  it('never leaves the book crossed or malformed after any command', () => {
    fc.assert(
      fc.property(commandStream(), (cmds) => {
        runAll(cmds).states.forEach((s) => assertBookInvariants(s.book));
      }),
      { numRuns: RUNS },
    );
  });

  it('agrees exactly with the naive reference model (trades and resting orders)', () => {
    fc.assert(
      fc.property(commandStream(), (cmds) => {
        const { state, events } = runAll(cmds);
        const ref = referenceRun(SPEC, cmds);
        const trades = events.flatMap((e) =>
          e.type === 'trade'
            ? [
                {
                  maker: e.makerOrderId,
                  taker: e.takerOrderId,
                  price: e.price,
                  quantity: e.quantity,
                },
              ]
            : [],
        );
        expect(trades).toEqual(ref.trades);
        const resting = allResting(state.book)
          .map((o) => `${o.orderId}:${o.remaining}`)
          .sort();
        expect(resting).toEqual(ref.resting.map((o) => `${o.id}:${o.remaining}`).sort());
      }),
      { numRuns: RUNS },
    );
  });

  it('conserves quantity per order: filled + resting + cancelled = original', () => {
    fc.assert(
      fc.property(commandStream(), (cmds) => {
        const { state, events } = runAll(cmds);
        const filled = new Map<string, number>();
        const cancelled = new Map<string, number>();
        const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
        for (const e of events) {
          if (e.type === 'trade') {
            add(filled, e.makerOrderId, e.quantity);
            add(filled, e.takerOrderId, e.quantity);
          }
          if (e.type === 'cancelled') add(cancelled, e.orderId, e.remaining);
        }
        const resting = new Map(allResting(state.book).map((o) => [o.orderId, o.remaining]));
        const accepted = new Set(events.filter((e) => e.type === 'accepted').map((e) => e.orderId));
        for (const cmd of cmds) {
          if (cmd.kind !== 'place' || !accepted.has(cmd.order.orderId)) continue;
          const id = cmd.order.orderId;
          const total = (filled.get(id) ?? 0) + (cancelled.get(id) ?? 0) + (resting.get(id) ?? 0);
          expect(total).toBe(cmd.order.quantity);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('never trades through a limit and always trades at the maker price', () => {
    fc.assert(
      fc.property(commandStream(), (cmds) => {
        const byId = new Map(
          cmds.flatMap((c) => (c.kind === 'place' ? [[c.order.orderId, c.order]] : [])),
        );
        for (const e of runAll(cmds).events) {
          if (e.type !== 'trade') continue;
          const taker = byId.get(e.takerOrderId)!;
          const maker = byId.get(e.makerOrderId)!;
          expect(e.price).toBe(maker.price);
          if (taker.type === 'limit') {
            const p = taker.price!;
            expect(taker.side === 'buy' ? e.price <= p : e.price >= p).toBe(true);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('FOK orders fill completely or not at all; IOC and market orders never rest', () => {
    fc.assert(
      fc.property(commandStream(), (cmds) => {
        const { state, events } = runAll(cmds);
        const restingIds = new Set(allResting(state.book).map((o) => o.orderId));
        for (const cmd of cmds) {
          if (cmd.kind !== 'place') continue;
          const o = cmd.order;
          if (o.tif === 'IOC' || o.tif === 'FOK' || o.type === 'market') {
            expect(restingIds.has(o.orderId)).toBe(false);
          }
          if (o.tif === 'FOK') {
            const qty = events
              .filter((e) => e.type === 'trade' && e.takerOrderId === o.orderId)
              .reduce((s, e) => s + (e.type === 'trade' ? e.quantity : 0), 0);
            expect([0, o.quantity]).toContain(qty);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('is deterministic: replaying the journal reproduces state, and trade ids are dense', () => {
    fc.assert(
      fc.property(commandStream(), fc.nat(), (cmds, cut) => {
        const { state, events } = runAll(cmds);
        expect(replay(SPEC, cmds)).toEqual(state);
        const k = cmds.length === 0 ? 0 : cut % cmds.length;
        expect(replay(SPEC, cmds.slice(k), replay(SPEC, cmds.slice(0, k)))).toEqual(state);
        const ids = events.flatMap((e) => (e.type === 'trade' ? [e.tradeId] : []));
        expect(ids).toEqual(ids.map((_, i) => i + 1));
        expect(state.seq).toBe(cmds.length);
      }),
      { numRuns: RUNS },
    );
  });
});
