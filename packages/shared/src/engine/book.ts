import type { OrderBook, PriceLevel, RestingOrder, Side } from './types.js';

/**
 * Persistent (immutable) central limit order book.
 *
 * Every operation returns a new book and shares untouched price levels with the
 * previous version, so an aborted command can simply keep the old reference.
 */

export const emptyBook = (): OrderBook => ({ bids: [], asks: [] });

export const bestBid = (book: OrderBook): number | null => book.bids[0]?.price ?? null;
export const bestAsk = (book: OrderBook): number | null => book.asks[0]?.price ?? null;

export const oppositeSide = (side: Side): Side => (side === 'buy' ? 'sell' : 'buy');

export const levelsFor = (book: OrderBook, side: Side): readonly PriceLevel[] =>
  side === 'buy' ? book.bids : book.asks;

export const withLevels = (
  book: OrderBook,
  side: Side,
  levels: readonly PriceLevel[],
): OrderBook => (side === 'buy' ? { ...book, bids: levels } : { ...book, asks: levels });

/** True when `a` is a strictly better price than `b` for resting orders on `side`. */
const isBetter = (side: Side, a: number, b: number): boolean => (side === 'buy' ? a > b : a < b);

/**
 * Binary search for the index of `price` within levels sorted best-first.
 * Returns `{ found, index }` where index is the insertion point when not found.
 */
export const findLevelIndex = (
  levels: readonly PriceLevel[],
  side: Side,
  price: number,
): { found: boolean; index: number } => {
  let lo = 0;
  let hi = levels.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midPrice = (levels[mid] as PriceLevel).price;
    if (midPrice === price) return { found: true, index: mid };
    if (isBetter(side, midPrice, price)) lo = mid + 1;
    else hi = mid;
  }
  return { found: false, index: lo };
};

export const makeLevel = (price: number, orders: readonly RestingOrder[]): PriceLevel => ({
  price,
  orders,
  total: orders.reduce((sum, o) => sum + o.remaining, 0),
});

/** Appends a resting order at the back of its price level's FIFO queue. O(log L + L) copy. */
export const insertResting = (book: OrderBook, order: RestingOrder): OrderBook => {
  const levels = levelsFor(book, order.side);
  const { found, index } = findLevelIndex(levels, order.side, order.price);
  const next = levels.slice();
  if (found) {
    const level = levels[index] as PriceLevel;
    next[index] = {
      price: level.price,
      orders: [...level.orders, order],
      total: level.total + order.remaining,
    };
  } else {
    next.splice(index, 0, makeLevel(order.price, [order]));
  }
  return withLevels(book, order.side, next);
};

export interface OrderLocation {
  readonly order: RestingOrder;
  readonly side: Side;
  readonly levelIndex: number;
  readonly orderIndex: number;
}

/** Linear scan over both sides. Resting books in the simulator are small; see ADR-0009. */
export const findOrder = (book: OrderBook, orderId: string): OrderLocation | null => {
  for (const side of ['buy', 'sell'] as const) {
    const levels = levelsFor(book, side);
    for (let li = 0; li < levels.length; li += 1) {
      const orders = (levels[li] as PriceLevel).orders;
      const oi = orders.findIndex((o) => o.orderId === orderId);
      if (oi >= 0) {
        return { order: orders[oi] as RestingOrder, side, levelIndex: li, orderIndex: oi };
      }
    }
  }
  return null;
};

/** Removes a resting order, dropping its level when it becomes empty. */
export const removeAt = (book: OrderBook, loc: OrderLocation): OrderBook => {
  const levels = levelsFor(book, loc.side);
  const level = levels[loc.levelIndex] as PriceLevel;
  const orders = level.orders.filter((_, i) => i !== loc.orderIndex);
  const next = levels.slice();
  if (orders.length === 0) next.splice(loc.levelIndex, 1);
  else
    next[loc.levelIndex] = { price: level.price, orders, total: level.total - loc.order.remaining };
  return withLevels(book, loc.side, next);
};

/** Iterates every resting order (bids best-first, then asks best-first). */
export const allResting = (book: OrderBook): RestingOrder[] =>
  [...book.bids, ...book.asks].flatMap((level) => [...level.orders]);
