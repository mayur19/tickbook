import type { NewOrder, OrderDelta, OrderStatus, TradeEvent } from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';

export interface OrderView {
  readonly id: string;
  readonly clientOrderId: string | null;
  readonly accountId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly type: 'limit' | 'market';
  readonly timeInForce: 'GTC' | 'IOC' | 'FOK';
  readonly price: number | null;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly filledNotional: number;
  readonly remainingQuantity: number;
  readonly status: OrderStatus;
  readonly rejectReason: string | null;
  readonly cancelReason: string | null;
  readonly journalSeq: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface OrderRow {
  id: string;
  client_order_id: string | null;
  account_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  time_in_force: 'GTC' | 'IOC' | 'FOK';
  price: number | null;
  quantity: number;
  filled_quantity: number;
  filled_notional: number;
  remaining_quantity: number;
  status: OrderStatus;
  reject_reason: string | null;
  cancel_reason: string | null;
  journal_seq: number | null;
  created_at: Date;
  updated_at: Date;
}

const toView = (r: OrderRow): OrderView => ({
  id: r.id,
  clientOrderId: r.client_order_id,
  accountId: r.account_id,
  symbol: r.symbol,
  side: r.side,
  type: r.type,
  timeInForce: r.time_in_force,
  price: r.price,
  quantity: r.quantity,
  filledQuantity: r.filled_quantity,
  filledNotional: r.filled_notional,
  remainingQuantity: r.remaining_quantity,
  status: r.status,
  rejectReason: r.reject_reason,
  cancelReason: r.cancel_reason,
  journalSeq: r.journal_seq,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const SELECT = `SELECT o.*, i.symbol FROM orders o JOIN instruments i ON i.id = o.instrument_id`;

export const insertOrder = async (
  db: Queryable,
  input: {
    order: NewOrder;
    organizationId: string;
    instrumentId: string;
    clientOrderId: string | null;
    createdBy: string;
    status: OrderStatus;
    rejectReason: string | null;
    journalSeq: number | null;
  },
): Promise<void> => {
  const o = input.order;
  await db.query(
    `INSERT INTO orders (id, organization_id, account_id, instrument_id, client_order_id, side, type,
                         time_in_force, price, quantity, remaining_quantity, status, reject_reason,
                         journal_seq, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      o.orderId,
      input.organizationId,
      o.accountId,
      input.instrumentId,
      input.clientOrderId,
      o.side,
      o.type,
      o.tif,
      o.price ?? null,
      o.quantity,
      input.status === 'rejected' ? 0 : o.quantity,
      input.status,
      input.rejectReason,
      input.journalSeq,
      input.createdBy,
    ],
  );
};

/** Applies engine-derived deltas to every order touched by a command. */
export const applyOrderDeltas = async (
  db: Queryable,
  deltas: Iterable<OrderDelta>,
): Promise<void> => {
  for (const d of deltas) {
    await db.query(
      `UPDATE orders SET
         filled_quantity = filled_quantity + $2,
         filled_notional = filled_notional + $3,
         remaining_quantity = COALESCE($4, remaining_quantity),
         status = COALESCE($5, status),
         reject_reason = COALESCE($6, reject_reason),
         cancel_reason = COALESCE($7, cancel_reason),
         updated_at = now()
       WHERE id = $1`,
      [
        d.orderId,
        d.filledQty,
        d.filledNotional,
        d.remaining,
        d.status,
        d.rejectReason,
        d.cancelReason,
      ],
    );
  }
};

export const insertTrades = async (
  db: Queryable,
  instrumentId: string,
  journalSeq: number,
  executedAt: string,
  trades: readonly TradeEvent[],
): Promise<void> => {
  for (const t of trades) {
    await db.query(
      `INSERT INTO trades (instrument_id, trade_id, price, quantity, aggressor_side, maker_order_id,
                           taker_order_id, maker_account_id, taker_account_id, journal_seq, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        instrumentId,
        t.tradeId,
        t.price,
        t.quantity,
        t.aggressorSide,
        t.makerOrderId,
        t.takerOrderId,
        t.makerAccountId,
        t.takerAccountId,
        journalSeq,
        executedAt,
      ],
    );
  }
};

export const findOrder = async (
  db: Queryable,
  organizationId: string,
  orderId: string,
): Promise<OrderView | null> => {
  const { rows } = await db.query<OrderRow>(
    `${SELECT} WHERE o.id = $1 AND o.organization_id = $2`,
    [orderId, organizationId],
  );
  return rows[0] ? toView(rows[0]) : null;
};

export const listOrders = async (
  db: Queryable,
  organizationId: string,
  filter: { status: 'open' | 'closed' | 'all'; symbol?: string; limit: number },
): Promise<OrderView[]> => {
  const where = ['o.organization_id = $1'];
  const params: unknown[] = [organizationId];
  if (filter.status === 'open') where.push(`o.status IN ('new', 'partially_filled')`);
  if (filter.status === 'closed') where.push(`o.status IN ('filled', 'cancelled', 'rejected')`);
  if (filter.symbol) {
    params.push(filter.symbol);
    where.push(`i.symbol = $${params.length}`);
  }
  params.push(filter.limit);
  const { rows } = await db.query<OrderRow>(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC, o.id LIMIT $${params.length}`,
    params,
  );
  return rows.map(toView);
};

export interface TradeView {
  readonly tradeId: number;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide: 'buy' | 'sell';
  readonly executedAt: string;
}

export const recentTrades = async (
  db: Queryable,
  instrumentId: string,
  limit: number,
): Promise<TradeView[]> => {
  const { rows } = await db.query<{
    trade_id: number;
    price: number;
    quantity: number;
    aggressor_side: 'buy' | 'sell';
    executed_at: Date;
  }>(
    `SELECT trade_id, price, quantity, aggressor_side, executed_at FROM trades
      WHERE instrument_id = $1 ORDER BY trade_id DESC LIMIT $2`,
    [instrumentId, limit],
  );
  return rows.map((r) => ({
    tradeId: r.trade_id,
    price: r.price,
    quantity: r.quantity,
    aggressorSide: r.aggressor_side,
    executedAt: r.executed_at.toISOString(),
  }));
};
