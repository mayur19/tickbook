import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyDepthUpdates,
  diffDepth,
  initialState,
  spreadOf,
  toDepth,
  type EngineState,
} from '../src/index.js';
import { commandStream } from './arbitraries.js';
import { SPEC, limit } from './fixtures.js';

describe('depth snapshots', () => {
  it('aggregates levels and limits depth', () => {
    let s = initialState('TBK');
    for (const cmd of [
      limit('buy', 100, 10),
      limit('buy', 100, 20),
      limit('buy', 95, 10),
      limit('sell', 110, 30),
    ]) {
      s = applyCommand(SPEC, s, cmd).state;
    }
    expect(toDepth(s.book, 1)).toEqual({
      bids: [{ price: 100, quantity: 30, orders: 2 }],
      asks: [{ price: 110, quantity: 30, orders: 1 }],
    });
    expect(spreadOf(toDepth(s.book, 5))).toEqual({ bid: 100, ask: 110, spread: 10, mid: 105 });
    expect(spreadOf({ bids: [], asks: [] })).toBeNull();
  });

  it('diffs removals, additions and changes', () => {
    const prev = {
      bids: [{ price: 100, quantity: 10, orders: 1 }],
      asks: [{ price: 110, quantity: 5, orders: 1 }],
    };
    const next = {
      bids: [{ price: 105, quantity: 10, orders: 1 }],
      asks: [{ price: 110, quantity: 7, orders: 2 }],
    };
    expect(diffDepth(prev, next)).toEqual([
      { side: 'buy', price: 100, quantity: 0, orders: 0 },
      { side: 'buy', price: 105, quantity: 10, orders: 1 },
      { side: 'sell', price: 110, quantity: 7, orders: 2 },
    ]);
    expect(diffDepth(next, next)).toEqual([]);
  });

  it('round-trips: apply(prev, diff(prev, next)) equals next for any engine evolution', () => {
    fc.assert(
      fc.property(commandStream(60), fc.integer({ min: 1, max: 6 }), (cmds, depth) => {
        let state: EngineState = initialState('TBK');
        let client = toDepth(state.book, depth);
        for (const cmd of cmds) {
          const prev = toDepth(state.book, depth);
          state = applyCommand(SPEC, state, cmd).state;
          const next = toDepth(state.book, depth);
          client = applyDepthUpdates(client, diffDepth(prev, next));
          expect(client).toEqual(next);
        }
      }),
      { numRuns: 200 },
    );
  });
});
