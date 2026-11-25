import type { EngineCommand, InstrumentSpec, NewOrder, Side, TimeInForce } from '../src/index.js';

export const SPEC: InstrumentSpec = {
  symbol: 'TBK',
  tickSize: 5,
  lotSize: 10,
  maxOrderQty: 100_000,
};

let counter = 0;
export const nextId = (): string => {
  counter += 1;
  return `o${counter}`;
};

export const limit = (
  side: Side,
  price: number,
  quantity: number,
  opts: { tif?: TimeInForce; accountId?: string; orderId?: string } = {},
): EngineCommand => ({
  kind: 'place',
  ts: '2026-01-01T00:00:00.000Z',
  order: {
    orderId: opts.orderId ?? nextId(),
    accountId: opts.accountId ?? 'acct-a',
    side,
    type: 'limit',
    tif: opts.tif ?? 'GTC',
    price,
    quantity,
  },
});

export const market = (
  side: Side,
  quantity: number,
  opts: { tif?: TimeInForce; accountId?: string; orderId?: string } = {},
): EngineCommand => ({
  kind: 'place',
  ts: '2026-01-01T00:00:00.000Z',
  order: {
    orderId: opts.orderId ?? nextId(),
    accountId: opts.accountId ?? 'acct-b',
    side,
    type: 'market',
    tif: opts.tif ?? 'IOC',
    quantity,
  },
});

export const cancel = (orderId: string, accountId = 'acct-a'): EngineCommand => ({
  kind: 'cancel',
  orderId,
  accountId,
  ts: '2026-01-01T00:00:00.000Z',
});

export const orderOf = (cmd: EngineCommand): NewOrder => {
  if (cmd.kind !== 'place') throw new Error('not a place command');
  return cmd.order;
};
