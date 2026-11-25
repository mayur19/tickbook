import { levelsFor, oppositeSide } from '../engine/book.js';
import type { NewOrder, OrderBook, Side } from '../engine/types.js';

export interface RiskLimits {
  /** Largest notional (minor units) accepted for one order. */
  readonly maxOrderNotional: number;
  /** Fat-finger band: maximum deviation of a limit price from the reference, in basis points. */
  readonly priceBandBps: number;
  /** Maximum absolute long position per instrument, including open buy orders. */
  readonly maxPosition: number;
}

/** Resting exposure of one account in one book. */
export interface BookExposure {
  readonly buyNotional: number;
  readonly buyQty: number;
  readonly sellQty: number;
}

export interface AccountRiskState {
  readonly cash: number;
  /** Cash already committed to open buy orders across all instruments. */
  readonly reservedCash: number;
  /** Current position in this instrument. */
  readonly position: number;
  /** Exposure from this account's resting orders in this instrument's book. */
  readonly exposure: BookExposure;
}

export interface RiskInput {
  readonly order: NewOrder;
  readonly book: OrderBook;
  /** Last trade price, falling back to the instrument's reference price; null when unknown. */
  readonly referencePrice: number | null;
  readonly account: AccountRiskState;
  readonly limits: RiskLimits;
}

export type RiskViolation =
  | 'price_band_exceeded'
  | 'notional_above_max'
  | 'insufficient_buying_power'
  | 'insufficient_position'
  | 'position_limit_exceeded';

export const exposureOf = (book: OrderBook, accountId: string): BookExposure => {
  let buyNotional = 0;
  let buyQty = 0;
  let sellQty = 0;
  for (const level of book.bids) {
    for (const o of level.orders) {
      if (o.accountId !== accountId) continue;
      buyNotional += o.price * o.remaining;
      buyQty += o.remaining;
    }
  }
  for (const level of book.asks) {
    for (const o of level.orders) if (o.accountId === accountId) sellQty += o.remaining;
  }
  return { buyNotional, buyQty, sellQty };
};

/**
 * Notional an incoming order would trade if it swept the book now, capped by its
 * limit (null = market). Only the executable part is counted. O(levels touched).
 */
export const estimateSweepNotional = (
  book: OrderBook,
  side: Side,
  quantity: number,
  limit: number | null,
): { quantity: number; notional: number } => {
  let left = quantity;
  let notional = 0;
  for (const level of levelsFor(book, oppositeSide(side))) {
    if (left === 0) break;
    if (limit !== null && (side === 'buy' ? level.price > limit : level.price < limit)) break;
    const qty = Math.min(left, level.total);
    notional += qty * level.price;
    left -= qty;
  }
  return { quantity: quantity - left, notional };
};

/** Worst-case cash commitment of a buy order: full limit notional, or the sweep cost for market. */
export const orderNotional = (order: NewOrder, book: OrderBook): number =>
  order.type === 'limit'
    ? (order.price as number) * order.quantity
    : estimateSweepNotional(book, order.side, order.quantity, null).notional;

const outsideBand = (price: number, reference: number, bandBps: number): boolean =>
  Math.abs(price - reference) * 10_000 > reference * bandBps;

/**
 * Pre-trade risk gate evaluated inside the instrument's serialized command queue,
 * so the book and reservations it sees are exactly those the order will meet.
 * Returns every violated rule (empty array = pass), in a stable order.
 */
export const checkPreTrade = (input: RiskInput): RiskViolation[] => {
  const { order, book, referencePrice, account, limits } = input;
  const violations: RiskViolation[] = [];
  const notional = orderNotional(order, book);

  if (
    order.type === 'limit' &&
    referencePrice !== null &&
    outsideBand(order.price as number, referencePrice, limits.priceBandBps)
  ) {
    violations.push('price_band_exceeded');
  }
  if (notional > limits.maxOrderNotional) violations.push('notional_above_max');

  if (order.side === 'buy') {
    if (notional > account.cash - account.reservedCash)
      violations.push('insufficient_buying_power');
    if (account.position + account.exposure.buyQty + order.quantity > limits.maxPosition) {
      violations.push('position_limit_exceeded');
    }
  } else if (order.quantity > account.position - account.exposure.sellQty) {
    violations.push('insufficient_position');
  }
  return violations;
};
