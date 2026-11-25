import { randomUUID } from 'node:crypto';
import {
  applyCommand,
  checkPreTrade,
  exposureOf,
  findOrder as findResting,
  orderDeltas,
  pendingOrderFeature,
  settlementDeltas,
  type EngineCommand,
  type EngineEvent,
  type NewOrder,
  type PlaceOrderInput,
  type TradeEvent,
} from '@tickbook/shared';
import { withTransaction, type Pool } from '../../db/pool.js';
import type { AuthContext } from '../../http/auth-context.js';
import { AppError, conflict, notFound, notImplemented, unprocessable } from '../../http/errors.js';
import type { Venue } from '../../venue/venue.js';
import { appendJournal } from '../../venue/journal.repository.js';
import { findAccount, getPosition, applySettlement } from '../accounts/accounts.repository.js';
import { writeAudit } from '../audit/audit.repository.js';
import {
  applyOrderDeltas,
  findOrder,
  insertOrder,
  insertTrades,
  type OrderView,
} from './orders.repository.js';

export interface OrderDeps {
  readonly pool: Pool;
  readonly venue: Venue;
  readonly now?: () => Date;
}

/** Execution as reported to the order owner: counterparty identities are never disclosed. */
export interface ExecutionView {
  readonly tradeId: number;
  readonly price: number;
  readonly quantity: number;
  readonly liquidity: 'taker';
}

export interface PlaceResult {
  readonly order: OrderView;
  readonly trades: readonly ExecutionView[];
}

const toExecution = (t: TradeEvent): ExecutionView => ({
  tradeId: t.tradeId,
  price: t.price,
  quantity: t.quantity,
  liquidity: 'taker',
});

const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';
const SETTLEMENT_CONSTRAINTS = new Set(['accounts_cash_non_negative', 'positions_quantity_check']);

const toEngineOrder = (input: PlaceOrderInput, orderId: string): NewOrder => ({
  orderId,
  accountId: input.accountId,
  side: input.side,
  type: input.type as 'limit' | 'market',
  tif: input.timeInForce as 'GTC' | 'IOC' | 'FOK',
  ...(input.price !== undefined ? { price: input.price } : {}),
  quantity: input.quantity,
});

const mapPersistenceError = (error: unknown): never => {
  const { code, constraint } = error as { code?: string; constraint?: string };
  if (code === PG_UNIQUE_VIOLATION) {
    throw conflict('DUPLICATE_CLIENT_ORDER_ID', 'clientOrderId already used for this account');
  }
  if (code === PG_CHECK_VIOLATION && SETTLEMENT_CONSTRAINTS.has(constraint ?? '')) {
    // Cross-instrument buying-power race (two books settling the same account at once).
    throw conflict('SETTLEMENT_CONFLICT', 'Account balance changed concurrently; retry the order');
  }
  throw error;
};

/**
 * Places an order: pre-trade risk check and matching run inside the instrument's
 * serialized section; the journal entry, order rows, trades and settlement are
 * written in one transaction before the new engine state is installed (ADR-0004).
 */
export const placeOrder = async (
  deps: OrderDeps,
  auth: AuthContext,
  input: PlaceOrderInput,
  requestId: string,
): Promise<PlaceResult> => {
  const pending = pendingOrderFeature(input);
  if (pending) throw notImplemented(`${pending.feature} are not implemented yet`, pending.ticket);
  if (input.type === 'limit' && input.price === undefined) {
    throw unprocessable('PRICE_REQUIRED', 'Limit orders require a price');
  }
  const view = deps.venue.view(input.symbol);
  if (!view) throw notFound(`Unknown instrument ${input.symbol}`);
  if (view.instrument.status !== 'open') {
    throw conflict('INSTRUMENT_NOT_OPEN', `${input.symbol} is ${view.instrument.status}`);
  }
  const account = await findAccount(deps.pool, auth.organizationId, input.accountId);
  if (!account) throw notFound('Account not found');

  const orderId = randomUUID();
  const order = toEngineOrder(input, orderId);
  const instrumentId = view.instrument.id;

  const trades = await deps.venue.serialize(input.symbol, async (current) => {
    const ts = (deps.now?.() ?? new Date()).toISOString();
    const base = {
      order,
      organizationId: auth.organizationId,
      instrumentId,
      clientOrderId: input.clientOrderId ?? null,
      createdBy: auth.userId,
    };
    const fresh = (await findAccount(deps.pool, auth.organizationId, account.id)) ?? account;
    const violations = checkPreTrade({
      order,
      book: current.state.book,
      referencePrice: current.lastPrice ?? current.instrument.referencePrice,
      account: {
        cash: fresh.cashMinor,
        reservedCash: deps.venue.reservedCash(account.id),
        position: await getPosition(deps.pool, account.id, instrumentId),
        exposure: exposureOf(current.state.book, account.id),
      },
      limits: {
        maxOrderNotional: fresh.maxOrderNotional,
        priceBandBps: current.instrument.priceBandBps,
        maxPosition: fresh.maxPosition,
      },
    });

    if (violations.length > 0) {
      await withTransaction(deps.pool, async (tx) => {
        await insertOrder(tx, {
          ...base,
          status: 'rejected',
          rejectReason: `risk:${violations[0]}`,
          journalSeq: null,
        });
        await writeAudit(tx, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'order.risk_rejected',
          entityType: 'order',
          entityId: orderId,
          metadata: { violations, symbol: input.symbol },
          requestId,
        });
      }).catch(mapPersistenceError);
      return { next: null, events: [], ts, result: { violations, trades: [] as TradeEvent[] } };
    }

    const command: EngineCommand = { kind: 'place', order, ts };
    const { state: next, events } = applyCommand(current.spec, current.state, command);
    const tradeEvents = events.filter((e): e is TradeEvent => e.type === 'trade');

    await withTransaction(deps.pool, async (tx) => {
      await appendJournal(tx, instrumentId, next.seq, command);
      await insertOrder(tx, { ...base, status: 'new', rejectReason: null, journalSeq: next.seq });
      await applyOrderDeltas(tx, orderDeltas(events).values());
      await insertTrades(tx, instrumentId, next.seq, ts, tradeEvents);
      await applySettlement(tx, instrumentId, settlementDeltas(events));
      await writeAudit(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'order.placed',
        entityType: 'order',
        entityId: orderId,
        metadata: { symbol: input.symbol, seq: next.seq, trades: tradeEvents.length },
        requestId,
      });
    }).catch(mapPersistenceError);

    return { next, events, ts, result: { violations, trades: tradeEvents } };
  });

  const saved = (await findOrder(deps.pool, auth.organizationId, orderId)) as OrderView;
  if (trades.violations.length > 0) {
    throw unprocessable('RISK_REJECTED', 'Order failed pre-trade risk checks', {
      orderId,
      violations: trades.violations,
    });
  }
  if (saved.status === 'rejected') {
    throw unprocessable('ORDER_REJECTED', `Order rejected: ${saved.rejectReason}`, {
      orderId,
      reason: saved.rejectReason,
    });
  }
  return { order: saved, trades: trades.trades.map(toExecution) };
};

/** Cancels a resting order owned by the caller's organization. */
export const cancelOrder = async (
  deps: OrderDeps,
  auth: AuthContext,
  orderId: string,
  requestId: string,
): Promise<OrderView> => {
  const existing = await findOrder(deps.pool, auth.organizationId, orderId);
  if (!existing) throw notFound('Order not found');

  await deps.venue.serialize(existing.symbol, async (current) => {
    const ts = (deps.now?.() ?? new Date()).toISOString();
    const loc = findResting(current.state.book, orderId);
    if (!loc) {
      throw conflict('ORDER_NOT_OPEN', `Order is ${existing.status} and cannot be cancelled`);
    }
    const command: EngineCommand = { kind: 'cancel', orderId, accountId: existing.accountId, ts };
    const { state: next, events } = applyCommand(current.spec, current.state, command);
    assertCancelled(events);
    await withTransaction(deps.pool, async (tx) => {
      await appendJournal(tx, current.instrument.id, next.seq, command);
      await applyOrderDeltas(tx, orderDeltas(events).values());
      await writeAudit(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'order.cancelled',
        entityType: 'order',
        entityId: orderId,
        metadata: { symbol: existing.symbol, seq: next.seq },
        requestId,
      });
    });
    return { next, events, ts, result: null };
  });

  return (await findOrder(deps.pool, auth.organizationId, orderId)) as OrderView;
};

const assertCancelled = (events: readonly EngineEvent[]): void => {
  if (!events.some((e) => e.type === 'cancelled')) {
    throw new AppError(500, 'ENGINE_INCONSISTENT', 'Engine refused a cancel the book allowed');
  }
};
