import type { EngineEvent } from './types.js';

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
