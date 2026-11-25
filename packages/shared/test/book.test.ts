import { describe, expect, it } from 'vitest';
import {
  allResting,
  bestAsk,
  bestBid,
  emptyBook,
  findLevelIndex,
  findOrder,
  insertResting,
  makeLevel,
  oppositeSide,
  removeAt,
  type RestingOrder,
} from '../src/index.js';

const resting = (
  id: string,
  side: 'buy' | 'sell',
  price: number,
  remaining: number,
  seq: number,
): RestingOrder => ({
  orderId: id,
  accountId: 'a',
  side,
  price,
  remaining,
  seq,
});

describe('order book', () => {
  it('starts empty with no best prices', () => {
    const book = emptyBook();
    expect(bestBid(book)).toBeNull();
    expect(bestAsk(book)).toBeNull();
    expect(allResting(book)).toEqual([]);
  });

  it('keeps bids sorted descending and asks ascending', () => {
    let book = emptyBook();
    for (const [i, p] of [100, 105, 95, 110].entries()) {
      book = insertResting(book, resting(`b${i}`, 'buy', p, 10, i));
      book = insertResting(book, resting(`s${i}`, 'sell', p + 100, 10, i + 10));
    }
    expect(book.bids.map((l) => l.price)).toEqual([110, 105, 100, 95]);
    expect(book.asks.map((l) => l.price)).toEqual([195, 200, 205, 210]);
    expect(bestBid(book)).toBe(110);
    expect(bestAsk(book)).toBe(195);
  });

  it('appends to an existing level preserving FIFO and totals', () => {
    let book = insertResting(emptyBook(), resting('a', 'buy', 100, 10, 1));
    book = insertResting(book, resting('b', 'buy', 100, 30, 2));
    expect(book.bids).toHaveLength(1);
    expect(book.bids[0]?.orders.map((o) => o.orderId)).toEqual(['a', 'b']);
    expect(book.bids[0]?.total).toBe(40);
  });

  it('does not mutate the previous version', () => {
    const v1 = insertResting(emptyBook(), resting('a', 'sell', 100, 10, 1));
    const v2 = insertResting(v1, resting('b', 'sell', 100, 10, 2));
    expect(v1.asks[0]?.orders).toHaveLength(1);
    expect(v2.asks[0]?.orders).toHaveLength(2);
  });

  it('binary-searches level indexes for both sides', () => {
    const bids = [makeLevel(110, []), makeLevel(100, []), makeLevel(90, [])];
    expect(findLevelIndex(bids, 'buy', 100)).toEqual({ found: true, index: 1 });
    expect(findLevelIndex(bids, 'buy', 120)).toEqual({ found: false, index: 0 });
    expect(findLevelIndex(bids, 'buy', 95)).toEqual({ found: false, index: 2 });
    expect(findLevelIndex(bids, 'buy', 10)).toEqual({ found: false, index: 3 });
    const asks = [makeLevel(90, []), makeLevel(100, [])];
    expect(findLevelIndex(asks, 'sell', 95)).toEqual({ found: false, index: 1 });
    expect(findLevelIndex([], 'sell', 95)).toEqual({ found: false, index: 0 });
  });

  it('finds and removes orders, dropping empty levels', () => {
    let book = insertResting(emptyBook(), resting('a', 'buy', 100, 10, 1));
    book = insertResting(book, resting('b', 'buy', 100, 20, 2));
    book = insertResting(book, resting('c', 'sell', 120, 5, 3));
    const locB = findOrder(book, 'b');
    expect(locB).toMatchObject({ side: 'buy', levelIndex: 0, orderIndex: 1 });
    book = removeAt(book, locB!);
    expect(book.bids[0]?.total).toBe(10);
    const locC = findOrder(book, 'c');
    book = removeAt(book, locC!);
    expect(book.asks).toEqual([]);
    expect(findOrder(book, 'zzz')).toBeNull();
  });

  it('computes the opposite side', () => {
    expect(oppositeSide('buy')).toBe('sell');
    expect(oppositeSide('sell')).toBe('buy');
  });
});
