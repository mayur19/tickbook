import type { OrderBook, PriceLevel, Side } from '../engine/types.js';

/** Aggregated price level as published to market-data consumers (no order identities). */
export interface DepthLevel {
  readonly price: number;
  readonly quantity: number;
  readonly orders: number;
}

export interface DepthSnapshot {
  readonly bids: readonly DepthLevel[];
  readonly asks: readonly DepthLevel[];
}

/** One incremental change; quantity 0 means the level was removed. */
export interface DepthUpdate {
  readonly side: Side;
  readonly price: number;
  readonly quantity: number;
  readonly orders: number;
}

const aggregate = (levels: readonly PriceLevel[], depth: number): DepthLevel[] =>
  levels
    .slice(0, depth)
    .map((l) => ({ price: l.price, quantity: l.total, orders: l.orders.length }));

/** Level-2 snapshot of the best `depth` levels per side. O(depth). */
export const toDepth = (book: OrderBook, depth: number): DepthSnapshot => ({
  bids: aggregate(book.bids, depth),
  asks: aggregate(book.asks, depth),
});

const diffSide = (
  side: Side,
  prev: readonly DepthLevel[],
  next: readonly DepthLevel[],
): DepthUpdate[] => {
  const before = new Map(prev.map((l) => [l.price, l]));
  const after = new Map(next.map((l) => [l.price, l]));
  const updates: DepthUpdate[] = [];
  for (const l of prev) {
    if (!after.has(l.price)) updates.push({ side, price: l.price, quantity: 0, orders: 0 });
  }
  for (const l of next) {
    const old = before.get(l.price);
    if (!old || old.quantity !== l.quantity || old.orders !== l.orders) {
      updates.push({ side, price: l.price, quantity: l.quantity, orders: l.orders });
    }
  }
  return updates;
};

/** Minimal set of level updates that transforms `prev` into `next`. O(depth). */
export const diffDepth = (prev: DepthSnapshot, next: DepthSnapshot): DepthUpdate[] => [
  ...diffSide('buy', prev.bids, next.bids),
  ...diffSide('sell', prev.asks, next.asks),
];

const applySide = (
  side: Side,
  levels: readonly DepthLevel[],
  updates: readonly DepthUpdate[],
): DepthLevel[] => {
  const map = new Map(levels.map((l) => [l.price, l]));
  for (const u of updates) {
    if (u.side !== side) continue;
    if (u.quantity === 0) map.delete(u.price);
    else map.set(u.price, { price: u.price, quantity: u.quantity, orders: u.orders });
  }
  const sorted = [...map.values()];
  return side === 'buy'
    ? sorted.sort((a, b) => b.price - a.price)
    : sorted.sort((a, b) => a.price - b.price);
};

/** Client-side reconstruction: applies incremental updates to a snapshot. */
export const applyDepthUpdates = (
  snapshot: DepthSnapshot,
  updates: readonly DepthUpdate[],
): DepthSnapshot => ({
  bids: applySide('buy', snapshot.bids, updates),
  asks: applySide('sell', snapshot.asks, updates),
});

/** Mid price and spread in minor units, null when either side is empty. */
export const spreadOf = (
  snapshot: DepthSnapshot,
): { bid: number; ask: number; spread: number; mid: number } | null => {
  const bid = snapshot.bids[0]?.price;
  const ask = snapshot.asks[0]?.price;
  if (bid === undefined || ask === undefined) return null;
  return { bid, ask, spread: ask - bid, mid: (bid + ask) / 2 };
};
