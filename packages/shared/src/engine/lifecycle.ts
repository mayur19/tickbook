import type { EngineEvent, NewOrder, RestingOrder } from './types.js';

export type OrderStatus = 'new' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';

/** Change to apply to one persisted order as a consequence of a command's events. */
export interface OrderDelta {
  readonly orderId: string;
  readonly filledQty: number;
  readonly filledNotional: number;
  /** Remaining open quantity after the command, or null when unchanged by this command. */
  readonly remaining: number | null;
  /** Terminal or new status implied by the events, or null when only fills happened. */
  readonly status: OrderStatus | null;
  readonly rejectReason: string | null;
  readonly cancelReason: string | null;
}

const blank = (orderId: string): OrderDelta => ({
  orderId,
  filledQty: 0,
  filledNotional: 0,
  remaining: null,
  status: null,
  rejectReason: null,
  cancelReason: null,
});

const fill = (d: OrderDelta, price: number, qty: number, remaining: number): OrderDelta => ({
  ...d,
  filledQty: d.filledQty + qty,
  filledNotional: d.filledNotional + price * qty,
  remaining,
  status: remaining === 0 ? 'filled' : 'partially_filled',
});

/**
 * Folds engine events into per-order deltas (taker and every maker touched).
 * Pure; used by the API to persist order state in the same transaction as the journal.
 */
export const orderDeltas = (events: readonly EngineEvent[]): ReadonlyMap<string, OrderDelta> => {
  const out = new Map<string, OrderDelta>();
  const get = (id: string): OrderDelta => out.get(id) ?? blank(id);
  for (const e of events) {
    switch (e.type) {
      case 'accepted':
        out.set(e.orderId, { ...get(e.orderId), status: 'new' });
        break;
      case 'rejected':
        out.set(e.orderId, {
          ...get(e.orderId),
          status: 'rejected',
          remaining: 0,
          rejectReason: e.reason,
        });
        break;
      case 'trade':
        out.set(e.makerOrderId, fill(get(e.makerOrderId), e.price, e.quantity, e.makerRemaining));
        out.set(e.takerOrderId, fill(get(e.takerOrderId), e.price, e.quantity, e.takerRemaining));
        break;
      case 'rested':
        out.set(e.orderId, { ...get(e.orderId), remaining: e.remaining });
        break;
      case 'cancelled':
        out.set(e.orderId, {
          ...get(e.orderId),
          status: 'cancelled',
          remaining: 0,
          cancelReason: e.reason,
        });
        break;
      case 'cancel_rejected':
        break;
    }
  }
  return out;
};

/** Per-account cash and position movements produced by trades (gross settlement, no fees yet). */
export interface SettlementDelta {
  readonly accountId: string;
  readonly cashDelta: number;
  readonly positionDelta: number;
}

export const settlementDeltas = (events: readonly EngineEvent[]): SettlementDelta[] => {
  const acc = new Map<string, { cash: number; pos: number }>();
  const bump = (id: string, cash: number, pos: number): void => {
    const cur = acc.get(id) ?? { cash: 0, pos: 0 };
    acc.set(id, { cash: cur.cash + cash, pos: cur.pos + pos });
  };
  for (const e of events) {
    if (e.type !== 'trade') continue;
    const notional = e.price * e.quantity;
    const buyer = e.aggressorSide === 'buy' ? e.takerAccountId : e.makerAccountId;
    const seller = e.aggressorSide === 'buy' ? e.makerAccountId : e.takerAccountId;
    bump(buyer, -notional, e.quantity);
    bump(seller, notional, -e.quantity);
  }
  return [...acc.entries()].map(([accountId, v]) => ({
    accountId,
    cashDelta: v.cash,
    positionDelta: v.pos,
  }));
};

/** Cash reservation held by an incoming buy order before it was matched. */
export interface TakerReservation {
  readonly order: NewOrder;
  readonly reserved: number;
}

/**
 * Per-account change to `reserved_cash_minor` implied by one command's events.
 * Invariant maintained: an account's reservation equals the sum of
 * price x remaining over its resting buy orders (ADR-0019).
 *
 *  - a resting buy filled as maker releases price x filled quantity;
 *  - an incoming buy releases its up-front reservation and re-reserves only what
 *    rests on the book (price x rested remaining);
 *  - a cancelled resting buy releases price x remaining (`cancelledResting` carries
 *    the resting orders a cancel command removed, since cancel events omit price).
 */
export const reservationDeltas = (
  events: readonly EngineEvent[],
  taker: TakerReservation | null,
  cancelledResting: ReadonlyMap<string, RestingOrder> = new Map(),
): Map<string, number> => {
  const out = new Map<string, number>();
  const bump = (id: string, v: number): void => {
    if (v !== 0) out.set(id, (out.get(id) ?? 0) + v);
  };
  if (taker && taker.order.side === 'buy') bump(taker.order.accountId, -taker.reserved);
  for (const e of events) {
    if (e.type === 'trade' && e.aggressorSide === 'sell')
      bump(e.makerAccountId, -e.price * e.quantity);
    if (e.type === 'rested' && e.side === 'buy' && taker && e.orderId === taker.order.orderId) {
      bump(taker.order.accountId, e.price * e.remaining);
    }
    if (e.type === 'cancelled') {
      const resting = cancelledResting.get(e.orderId);
      if (resting && resting.side === 'buy') bump(resting.accountId, -resting.price * e.remaining);
    }
  }
  return new Map([...out].filter(([, v]) => v !== 0));
};
