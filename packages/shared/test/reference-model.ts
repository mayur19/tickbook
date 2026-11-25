import type { EngineCommand, InstrumentSpec, Side } from '../src/index.js';
import { validateOrder } from '../src/index.js';

/**
 * Deliberately naive reference matcher used for differential testing: a flat
 * array of resting orders, re-sorted on every match. Slow but obviously correct.
 */
export interface RefOrder {
  id: string;
  account: string;
  side: Side;
  price: number;
  remaining: number;
  seq: number;
}

export interface RefTrade {
  maker: string;
  taker: string;
  price: number;
  quantity: number;
}

export interface RefResult {
  resting: RefOrder[];
  trades: RefTrade[];
}

const better = (side: Side) => (a: RefOrder, b: RefOrder) =>
  (side === 'buy' ? b.price - a.price : a.price - b.price) || a.seq - b.seq;

export const referenceRun = (spec: InstrumentSpec, cmds: readonly EngineCommand[]): RefResult => {
  let resting: RefOrder[] = [];
  const trades: RefTrade[] = [];
  cmds.forEach((cmd, i) => {
    const seq = i + 1;
    if (cmd.kind === 'cancel') {
      resting = resting.filter((o) => !(o.id === cmd.orderId && o.account === cmd.accountId));
      return;
    }
    const o = cmd.order;
    if (validateOrder(spec, o) !== null || resting.some((r) => r.id === o.orderId)) return;
    const makerSide: Side = o.side === 'buy' ? 'sell' : 'buy';
    const ok = (p: number) =>
      o.type === 'market' ||
      (o.side === 'buy' ? p <= (o.price as number) : p >= (o.price as number));
    const book = resting.filter((r) => r.side === makerSide && ok(r.price)).sort(better(makerSide));
    const liquidity = book.reduce((s, r) => s + r.remaining, 0);
    if (o.tif === 'FOK' && liquidity < o.quantity) return;
    let left = o.quantity;
    for (const maker of book) {
      if (left === 0) break;
      const q = Math.min(left, maker.remaining);
      trades.push({ maker: maker.id, taker: o.orderId, price: maker.price, quantity: q });
      maker.remaining -= q;
      left -= q;
    }
    resting = resting.filter((r) => r.remaining > 0);
    if (left > 0 && o.type === 'limit' && o.tif === 'GTC') {
      resting.push({
        id: o.orderId,
        account: o.accountId,
        side: o.side,
        price: o.price as number,
        remaining: left,
        seq,
      });
    }
  });
  return { resting, trades };
};
