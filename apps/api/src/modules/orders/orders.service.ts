import { randomUUID } from 'node:crypto';
import {
  applyCommand,
  checkPreTrade,
  exposureOf,
  findOrder as findResting,
  orderDeltas,
  orderNotional,
  pendingOrderFeature,
  reservationDeltas,
  settlementDeltas,
  type EngineCommand,
  type EngineEvent,
  type NewOrder,
  type PlaceOrderInput,
  type TradeEvent,
} from '@tickbook/shared';
import { withTransaction, type Pool, type Queryable } from '../../db/pool.js';
import type { AuthContext } from '../../http/auth-context.js';
import { AppError, conflict, notFound, notImplemented, unprocessable } from '../../http/errors.js';
import type { Venue } from '../../venue/venue.js';
import { appendJournal } from '../../venue/journal.repository.js';
import {
  applySettlement,
  findAccount,
  getPosition,
  lockAccounts,
  releaseReservationClamped,
  reserveCash,
} from '../accounts/accounts.repository.js';
import { writeAudit } from '../audit/audit.repository.js';
import {
  applyOrderDeltas,
  findOrder,
  insertOrder,
  insertTrades,
  type OrderView,
} from './orders.repository.js';
import { planWithFundedMakers, type SystemCancel } from './funding.js';

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
const PG_DEADLOCK = '40P01';
const SETTLEMENT_CONSTRAINTS = new Set([
  'accounts_cash_non_negative',
  'accounts_reserved_bounds',
  'positions_quantity_check',
]);

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
  if (
    (code === PG_CHECK_VIOLATION && SETTLEMENT_CONSTRAINTS.has(constraint ?? '')) ||
    code === PG_DEADLOCK
  ) {
    // Defensive: balances changed out of band; nothing was journaled or installed.
    throw conflict('SETTLEMENT_CONFLICT', 'Account balance changed concurrently; retry the order');
  }
  throw error;
};

class ReservationRefused extends Error {}

interface RejectionInput {
  readonly order: NewOrder;
  readonly base: Omit<Parameters<typeof insertOrder>[1], 'status' | 'rejectReason' | 'journalSeq'>;
  readonly violations: readonly string[];
  readonly auth: AuthContext;
  readonly symbol: string;
  readonly requestId: string;
}

const persistRiskRejection = (pool: Pool, r: RejectionInput): Promise<void> =>
  withTransaction(pool, async (tx) => {
    await insertOrder(tx, {
      ...r.base,
      status: 'rejected',
      rejectReason: `risk:${r.violations[0]}`,
      journalSeq: null,
    });
    await writeAudit(tx, {
      organizationId: r.auth.organizationId,
      actorUserId: r.auth.userId,
      action: 'order.risk_rejected',
      entityType: 'order',
      entityId: r.order.orderId,
      metadata: { violations: r.violations, symbol: r.symbol },
      requestId: r.requestId,
    });
  }).catch(mapPersistenceError);

/** Journals the venue-initiated cancels of unfunded makers inside the order's transaction. */
const writeSystemCancels = async (
  tx: Queryable,
  instrumentId: string,
  cancels: readonly SystemCancel[],
  requestId: string,
): Promise<void> => {
  for (const c of cancels) {
    await appendJournal(tx, instrumentId, c.seq, c.command);
    await applyOrderDeltas(tx, orderDeltas(c.events).values());
    const released = reservationDeltas(c.events, null, new Map([[c.resting.orderId, c.resting]]));
    for (const [accountId, delta] of released) {
      await releaseReservationClamped(tx, accountId, -delta);
    }
    const { rows } = await tx.query<{ organization_id: string }>(
      'SELECT organization_id FROM orders WHERE id = $1',
      [c.resting.orderId],
    );
    await writeAudit(tx, {
      organizationId: rows[0]?.organization_id ?? null,
      actorUserId: null,
      action: 'order.cancelled_insufficient_funds',
      entityType: 'order',
      entityId: c.resting.orderId,
      metadata: { seq: c.seq, accountId: c.resting.accountId },
      requestId,
    });
  }
};

const touchedAccounts = (takerAccountId: string, events: readonly EngineEvent[]): string[] => [
  takerAccountId,
  ...events.flatMap((e) => (e.type === 'trade' ? [e.makerAccountId, e.takerAccountId] : [])),
];

/**
 * Places an order. Inside the instrument's serialized section and the account's
 * reservation lock (instrument first, then account; ADR-0019):
 *  1. pre-trade risk against the durable reservation;
 *  2. dry-run matching, cancelling resting makers that can no longer settle;
 *  3. one transaction: lock touched accounts in id order, conditionally reserve the
 *     buy notional, journal system cancels + the order, write orders/trades,
 *     settle cash/positions and adjust reservations;
 *  4. only then install the new engine state (ADR-0004, ADR-0010).
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
  const base = {
    order,
    organizationId: auth.organizationId,
    instrumentId,
    clientOrderId: input.clientOrderId ?? null,
    createdBy: auth.userId,
  };

  const outcome = await deps.venue.serialize(input.symbol, (current) =>
    deps.venue.withAccountLock(account.id, async () => {
      const ts = (deps.now?.() ?? new Date()).toISOString();
      const fresh = (await findAccount(deps.pool, auth.organizationId, account.id)) ?? account;
      const violations = checkPreTrade({
        order,
        book: current.state.book,
        referencePrice: current.lastPrice ?? current.instrument.referencePrice,
        account: {
          cash: fresh.cashMinor,
          reservedCash: fresh.reservedCashMinor,
          position: await getPosition(deps.pool, account.id, instrumentId),
          exposure: exposureOf(current.state.book, account.id),
        },
        limits: {
          maxOrderNotional: fresh.maxOrderNotional,
          priceBandBps: current.instrument.priceBandBps,
          maxPosition: fresh.maxPosition,
        },
      });
      const rejected = (v: readonly string[]) => ({
        next: null,
        events: [],
        ts,
        result: { violations: v, trades: [] as TradeEvent[] },
      });
      if (violations.length > 0) {
        await persistRiskRejection(deps.pool, {
          order,
          base,
          violations,
          auth,
          symbol: input.symbol,
          requestId,
        });
        return rejected(violations);
      }

      const command: EngineCommand = { kind: 'place', order, ts };
      const plan = await planWithFundedMakers(
        deps.pool,
        current.spec,
        instrumentId,
        current.state,
        command,
      );
      const reserve = order.side === 'buy' ? orderNotional(order, plan.state.book) : 0;
      const { state: next, events } = applyCommand(current.spec, plan.state, command);
      const tradeEvents = events.filter((e): e is TradeEvent => e.type === 'trade');
      const allEvents = [...plan.cancels.flatMap((c) => c.events), ...events];

      try {
        await withTransaction(deps.pool, async (tx) => {
          await lockAccounts(tx, touchedAccounts(account.id, allEvents));
          if (reserve > 0 && !(await reserveCash(tx, account.id, reserve)))
            throw new ReservationRefused();
          await writeSystemCancels(tx, instrumentId, plan.cancels, requestId);
          await appendJournal(tx, instrumentId, next.seq, command);
          await insertOrder(tx, {
            ...base,
            status: 'new',
            rejectReason: null,
            journalSeq: next.seq,
          });
          await applyOrderDeltas(tx, orderDeltas(events).values());
          await insertTrades(tx, instrumentId, next.seq, ts, tradeEvents);
          await applySettlement(
            tx,
            instrumentId,
            settlementDeltas(events),
            reservationDeltas(events, { order, reserved: reserve }),
          );
          await writeAudit(tx, {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'order.placed',
            entityType: 'order',
            entityId: orderId,
            metadata: {
              symbol: input.symbol,
              seq: next.seq,
              trades: tradeEvents.length,
              reserved: reserve,
            },
            requestId,
          });
        });
      } catch (error) {
        if (!(error instanceof ReservationRefused)) return mapPersistenceError(error);
        const refused = ['insufficient_buying_power'];
        await persistRiskRejection(deps.pool, {
          order,
          base,
          violations: refused,
          auth,
          symbol: input.symbol,
          requestId,
        });
        return rejected(refused);
      }
      return {
        next,
        events: allEvents,
        ts,
        result: { violations: [] as string[], trades: tradeEvents },
      };
    }),
  );

  const saved = (await findOrder(deps.pool, auth.organizationId, orderId)) as OrderView;
  if (outcome.violations.length > 0) {
    throw unprocessable('RISK_REJECTED', 'Order failed pre-trade risk checks', {
      orderId,
      violations: outcome.violations,
    });
  }
  if (saved.status === 'rejected') {
    throw unprocessable('ORDER_REJECTED', `Order rejected: ${saved.rejectReason}`, {
      orderId,
      reason: saved.rejectReason,
    });
  }
  return { order: saved, trades: outcome.trades.map(toExecution) };
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
      await applySettlement(
        tx,
        current.instrument.id,
        [],
        reservationDeltas(events, null, new Map([[orderId, loc.order]])),
      );
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
