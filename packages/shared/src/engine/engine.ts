import { emptyBook, findOrder, insertResting, removeAt } from './book.js';
import { availableLiquidity, sweep } from './matching.js';
import type {
  CancelCommand,
  CommandResult,
  EngineCommand,
  EngineEvent,
  EngineState,
  InstrumentSpec,
  PlaceCommand,
} from './types.js';
import { validateOrder } from './validation.js';

/**
 * Deterministic single-instrument matching engine.
 *
 * `applyCommand` is a pure state transition: the same state and command always
 * produce the same next state and event list. Recovery is therefore a fold of
 * the persisted journal over `initialState` (see `replay`).
 */

export const initialState = (symbol: string): EngineState => ({
  symbol,
  book: emptyBook(),
  seq: 0,
  lastTradeId: 0,
});

const place = (spec: InstrumentSpec, state: EngineState, cmd: PlaceCommand): CommandResult => {
  const seq = state.seq + 1;
  const order = cmd.order;
  const reason = validateOrder(spec, order);
  const duplicate = reason === null && findOrder(state.book, order.orderId) !== null;
  if (reason !== null || duplicate) {
    const events: EngineEvent[] = [
      { type: 'rejected', orderId: order.orderId, reason: reason ?? 'duplicate_order_id' },
    ];
    return { state: { ...state, seq }, events };
  }

  const limit = order.type === 'market' ? null : (order.price as number);
  const accepted: EngineEvent = { type: 'accepted', orderId: order.orderId };

  if (order.tif === 'FOK') {
    const available = availableLiquidity(state.book, order.side, limit, order.quantity);
    if (available < order.quantity) {
      const events: EngineEvent[] = [
        accepted,
        {
          type: 'cancelled',
          orderId: order.orderId,
          remaining: order.quantity,
          reason: 'fok_unfillable',
        },
      ];
      return { state: { ...state, seq }, events };
    }
  }

  const swept = sweep(state.book, order, state.lastTradeId);
  const events: EngineEvent[] = [accepted, ...swept.trades];
  let book = swept.book;

  if (swept.remaining > 0) {
    if (order.type === 'limit' && order.tif === 'GTC') {
      book = insertResting(book, {
        orderId: order.orderId,
        accountId: order.accountId,
        side: order.side,
        price: limit as number,
        remaining: swept.remaining,
        seq,
      });
      events.push({
        type: 'rested',
        orderId: order.orderId,
        side: order.side,
        price: limit as number,
        remaining: swept.remaining,
      });
    } else {
      events.push({
        type: 'cancelled',
        orderId: order.orderId,
        remaining: swept.remaining,
        reason: order.type === 'market' ? 'market_no_liquidity' : 'ioc_remainder',
      });
    }
  }

  return { state: { ...state, book, seq, lastTradeId: swept.lastTradeId }, events };
};

const cancel = (state: EngineState, cmd: CancelCommand): CommandResult => {
  const seq = state.seq + 1;
  const loc = findOrder(state.book, cmd.orderId);
  if (!loc) {
    return {
      state: { ...state, seq },
      events: [{ type: 'cancel_rejected', orderId: cmd.orderId, reason: 'unknown_order' }],
    };
  }
  if (loc.order.accountId !== cmd.accountId) {
    return {
      state: { ...state, seq },
      events: [{ type: 'cancel_rejected', orderId: cmd.orderId, reason: 'not_owner' }],
    };
  }
  return {
    state: { ...state, seq, book: removeAt(state.book, loc) },
    events: [
      {
        type: 'cancelled',
        orderId: cmd.orderId,
        remaining: loc.order.remaining,
        reason: 'user_requested',
      },
    ],
  };
};

export const applyCommand = (
  spec: InstrumentSpec,
  state: EngineState,
  cmd: EngineCommand,
): CommandResult => (cmd.kind === 'place' ? place(spec, state, cmd) : cancel(state, cmd));

/** Rebuilds engine state by folding a journal of commands, in sequence order. */
export const replay = (
  spec: InstrumentSpec,
  commands: readonly EngineCommand[],
  from: EngineState = initialState(spec.symbol),
): EngineState => commands.reduce((state, cmd) => applyCommand(spec, state, cmd).state, from);
