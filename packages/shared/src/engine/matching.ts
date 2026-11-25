import { levelsFor, oppositeSide, withLevels } from './book.js';
import type { NewOrder, OrderBook, PriceLevel, RestingOrder, Side, TradeEvent } from './types.js';

/** Whether a resting price is marketable against an incoming limit (null = market order). */
export const crosses = (takerSide: Side, limit: number | null, restingPrice: number): boolean => {
  if (limit === null) return true;
  return takerSide === 'buy' ? restingPrice <= limit : restingPrice >= limit;
};

/**
 * Quantity available to an incoming order at or better than its limit,
 * stopping early once `needed` is reached. Used for FOK pre-checks. O(levels touched).
 */
export const availableLiquidity = (
  book: OrderBook,
  takerSide: Side,
  limit: number | null,
  needed: number,
): number => {
  let sum = 0;
  for (const level of levelsFor(book, oppositeSide(takerSide))) {
    if (!crosses(takerSide, limit, level.price)) break;
    sum += level.total;
    if (sum >= needed) return sum;
  }
  return sum;
};

export interface SweepResult {
  readonly book: OrderBook;
  readonly trades: readonly TradeEvent[];
  readonly remaining: number;
  readonly lastTradeId: number;
}

interface LevelSweep {
  readonly level: PriceLevel | null;
  readonly trades: TradeEvent[];
  readonly remaining: number;
  readonly lastTradeId: number;
}

/** Consumes a single price level in FIFO order. Returns the residual level (null if emptied). */
const sweepLevel = (
  level: PriceLevel,
  taker: NewOrder,
  remaining: number,
  lastTradeId: number,
): LevelSweep => {
  const trades: TradeEvent[] = [];
  let left = remaining;
  let tradeId = lastTradeId;
  let consumed = 0;
  let partial: RestingOrder | null = null;

  for (const maker of level.orders) {
    if (left === 0) break;
    const qty = Math.min(left, maker.remaining);
    left -= qty;
    tradeId += 1;
    const makerRemaining = maker.remaining - qty;
    trades.push({
      type: 'trade',
      tradeId,
      price: level.price,
      quantity: qty,
      aggressorSide: taker.side,
      makerOrderId: maker.orderId,
      makerAccountId: maker.accountId,
      takerOrderId: taker.orderId,
      takerAccountId: taker.accountId,
      makerRemaining,
      takerRemaining: left,
    });
    if (makerRemaining === 0) consumed += 1;
    else partial = { ...maker, remaining: makerRemaining };
  }

  const tail = level.orders.slice(consumed + (partial ? 1 : 0));
  const orders = partial ? [partial, ...tail] : tail;
  const filled = remaining - left;
  const residual =
    orders.length === 0 ? null : { price: level.price, orders, total: level.total - filled };
  return { level: residual, trades, remaining: left, lastTradeId: tradeId };
};

/**
 * Matches an incoming order against the opposite side with price-time priority:
 * best price first, and FIFO (lowest sequence) within a price. Trades execute at
 * the resting (maker) price. Pure: returns a new book sharing untouched levels.
 */
export const sweep = (book: OrderBook, taker: NewOrder, lastTradeId: number): SweepResult => {
  const makerSide = oppositeSide(taker.side);
  const levels = levelsFor(book, makerSide);
  const limit = taker.type === 'market' ? null : (taker.price ?? null);
  const trades: TradeEvent[] = [];
  let remaining = taker.quantity;
  let tradeId = lastTradeId;
  let index = 0;
  let residual: PriceLevel | null = null;

  while (remaining > 0 && index < levels.length) {
    const level = levels[index] as PriceLevel;
    if (!crosses(taker.side, limit, level.price)) break;
    const result = sweepLevel(level, taker, remaining, tradeId);
    trades.push(...result.trades);
    remaining = result.remaining;
    tradeId = result.lastTradeId;
    if (result.level) {
      residual = result.level;
      break;
    }
    index += 1;
  }

  if (trades.length === 0) return { book, trades, remaining, lastTradeId };
  const untouched = levels.slice(residual ? index + 1 : index);
  const nextLevels = residual ? [residual, ...untouched] : untouched;
  return { book: withLevels(book, makerSide, nextLevels), trades, remaining, lastTradeId: tradeId };
};
