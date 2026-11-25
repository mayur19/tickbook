import type { MarketMessage } from '@tickbook/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import {
  authed,
  createContext,
  createFirm,
  login,
  type Firm,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let firm: Firm;
let session: Session;

beforeEach(async () => {
  if (ctx) await ctx.close();
  ctx = await createContext();
  firm = await createFirm(ctx.pool, 'Socket Co', {
    cash: 10_000_000,
    positions: { TBK: 1_000 },
    instruments: ctx.instruments,
  });
  session = await login(ctx.app, firm.emails.owner);
  await ctx.app.ready();
});
afterAll(async () => ctx?.close());

/** Buffers every message from the moment the socket exists (the snapshot arrives immediately). */
const open = async (url: string, cookie?: string) => {
  const inbox: MarketMessage[] = [];
  const waiters: (() => void)[] = [];
  const ws = await ctx.app.injectWS(url, cookie ? { headers: { cookie } } : {}, {
    onInit: (socket: WebSocket) => {
      socket.on('message', (raw: Buffer) => {
        inbox.push(JSON.parse(raw.toString()));
        waiters.splice(0).forEach((w) => w());
      });
    },
  });
  let read = 0;
  const take = async (count: number): Promise<MarketMessage[]> => {
    const deadline = Date.now() + 5_000;
    while (inbox.length - read < count) {
      if (Date.now() > deadline) throw new Error(`timed out with ${inbox.length - read} messages`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
    const out = inbox.slice(read, read + count);
    read += count;
    return out;
  };
  return { ws, take };
};

const closeCode = (ws: WebSocket): Promise<number> =>
  new Promise((resolve) => ws.on('close', (code: number) => resolve(code)));

describe('market data websocket', () => {
  it('sends a snapshot, then sequenced depth updates and trades', async () => {
    const { ws, take } = await open('/ws/market?symbol=tbk', session.cookie);
    const [snapshot] = await take(1);
    expect(snapshot).toEqual({ type: 'snapshot', symbol: 'TBK', seq: 0, bids: [], asks: [] });

    const order = (side: string, price: number) =>
      authed(ctx.app, session, 'POST', '/api/v1/orders', {
        accountId: firm.accountId,
        symbol: 'TBK',
        side,
        type: 'limit',
        price,
        quantity: 20,
      });
    await order('sell', 1_000);
    await order('buy', 1_000);
    const messages = await take(3);
    expect(messages[0]).toEqual({
      type: 'depth',
      symbol: 'TBK',
      seq: 1,
      updates: [{ side: 'sell', price: 1_000, quantity: 20, orders: 1 }],
    });
    expect(messages[1]).toMatchObject({
      type: 'trade',
      seq: 2,
      tradeId: 1,
      price: 1_000,
      quantity: 20,
      aggressorSide: 'buy',
    });
    expect(messages[2]).toEqual({
      type: 'depth',
      symbol: 'TBK',
      seq: 2,
      updates: [{ side: 'sell', price: 1_000, quantity: 0, orders: 0 }],
    });

    ws.send('snapshot');
    expect((await take(1))[0]).toMatchObject({ type: 'snapshot', seq: 2 });
    ws.terminate();
  });

  it('closes unauthenticated and unknown-symbol connections with application codes', async () => {
    const anon = await ctx.app.injectWS('/ws/market?symbol=TBK');
    expect(await closeCode(anon)).toBe(4401);
    const unknown = await ctx.app.injectWS('/ws/market?symbol=ZZZ', {
      headers: { cookie: session.cookie },
    });
    expect(await closeCode(unknown)).toBe(4404);
  });
});
