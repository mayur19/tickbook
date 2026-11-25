import type { SettlementDelta } from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';

export interface AccountRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  readonly cashMinor: number;
  readonly reservedCashMinor: number;
  readonly maxOrderNotional: number;
  readonly maxPosition: number;
}

export interface PositionRecord {
  readonly accountId: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly quantity: number;
}

interface AccountRow {
  id: string;
  organization_id: string;
  name: string;
  currency: string;
  cash_minor: number;
  reserved_cash_minor: number;
  max_order_notional: number;
  max_position: number;
}

const toAccount = (r: AccountRow): AccountRecord => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  currency: r.currency,
  cashMinor: r.cash_minor,
  reservedCashMinor: r.reserved_cash_minor,
  maxOrderNotional: r.max_order_notional,
  maxPosition: r.max_position,
});

export const createAccount = async (
  db: Queryable,
  input: { organizationId: string; name: string; cashMinor: number },
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO accounts (organization_id, name, cash_minor) VALUES ($1, $2, $3) RETURNING id',
    [input.organizationId, input.name, input.cashMinor],
  );
  return (rows[0] as { id: string }).id;
};

/** Tenant-scoped lookup: an account is only visible to its own organization. */
export const findAccount = async (
  db: Queryable,
  organizationId: string,
  accountId: string,
): Promise<AccountRecord | null> => {
  const { rows } = await db.query<AccountRow>(
    'SELECT * FROM accounts WHERE id = $1 AND organization_id = $2',
    [accountId, organizationId],
  );
  return rows[0] ? toAccount(rows[0]) : null;
};

export const listAccounts = async (
  db: Queryable,
  organizationId: string,
): Promise<AccountRecord[]> => {
  const { rows } = await db.query<AccountRow>(
    'SELECT * FROM accounts WHERE organization_id = $1 ORDER BY created_at, name',
    [organizationId],
  );
  return rows.map(toAccount);
};

export const listPositions = async (
  db: Queryable,
  accountIds: readonly string[],
): Promise<PositionRecord[]> => {
  if (accountIds.length === 0) return [];
  const { rows } = await db.query<{
    account_id: string;
    instrument_id: string;
    symbol: string;
    quantity: number;
  }>(
    `SELECT p.account_id, p.instrument_id, i.symbol, p.quantity
       FROM positions p JOIN instruments i ON i.id = p.instrument_id
      WHERE p.account_id = ANY($1::uuid[]) AND p.quantity <> 0
      ORDER BY i.symbol`,
    [accountIds],
  );
  return rows.map((r) => ({
    accountId: r.account_id,
    instrumentId: r.instrument_id,
    symbol: r.symbol,
    quantity: r.quantity,
  }));
};

export const getPosition = async (
  db: Queryable,
  accountId: string,
  instrumentId: string,
): Promise<number> => {
  const { rows } = await db.query<{ quantity: number }>(
    'SELECT quantity FROM positions WHERE account_id = $1 AND instrument_id = $2',
    [accountId, instrumentId],
  );
  return rows[0]?.quantity ?? 0;
};

/**
 * Locks every account a command touches, in ascending id order, so two
 * instruments settling overlapping accounts can never deadlock (ADR-0019).
 */
export const lockAccounts = async (db: Queryable, accountIds: Iterable<string>): Promise<void> => {
  const ids = [...new Set(accountIds)].sort();
  if (ids.length === 0) return;
  await db.query('SELECT id FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    ids,
  ]);
};

/**
 * Durable buying-power gate: reserves `amount` only if the account still has that
 * much unreserved cash. Returns false (and changes nothing) otherwise.
 */
export const reserveCash = async (
  db: Queryable,
  accountId: string,
  amount: number,
): Promise<boolean> => {
  const { rows } = await db.query(
    `UPDATE accounts SET reserved_cash_minor = reserved_cash_minor + $2
      WHERE id = $1 AND cash_minor - reserved_cash_minor >= $2
      RETURNING id`,
    [accountId, amount],
  );
  return rows.length === 1;
};

/**
 * Releases a reservation, clamped at zero. Only for venue-initiated cancels of
 * makers whose balances were changed out of band, where the reservation may
 * already be gone; normal paths use exact deltas so drift is caught by the CHECK.
 */
export const releaseReservationClamped = async (
  db: Queryable,
  accountId: string,
  amount: number,
): Promise<void> => {
  await db.query(
    'UPDATE accounts SET reserved_cash_minor = GREATEST(0, reserved_cash_minor - $2) WHERE id = $1',
    [accountId, amount],
  );
};

export interface FundsSnapshot {
  readonly cashMinor: number;
  readonly reservedCashMinor: number;
}

export const fundsOf = async (
  db: Queryable,
  accountIds: readonly string[],
): Promise<Map<string, FundsSnapshot>> => {
  if (accountIds.length === 0) return new Map();
  const { rows } = await db.query<{ id: string; cash_minor: number; reserved_cash_minor: number }>(
    'SELECT id, cash_minor, reserved_cash_minor FROM accounts WHERE id = ANY($1::uuid[])',
    [accountIds],
  );
  return new Map(
    rows.map((r) => [r.id, { cashMinor: r.cash_minor, reservedCashMinor: r.reserved_cash_minor }]),
  );
};

export const positionsOf = async (
  db: Queryable,
  instrumentId: string,
  accountIds: readonly string[],
): Promise<Map<string, number>> => {
  if (accountIds.length === 0) return new Map();
  const { rows } = await db.query<{ account_id: string; quantity: number }>(
    'SELECT account_id, quantity FROM positions WHERE instrument_id = $1 AND account_id = ANY($2::uuid[])',
    [instrumentId, accountIds],
  );
  return new Map(rows.map((r) => [r.account_id, r.quantity]));
};

/**
 * Applies gross trade settlement to cash and positions plus reservation changes
 * (fees and ledger postings are planned, TB-301/TB-311).
 */
export const applySettlement = async (
  db: Queryable,
  instrumentId: string,
  deltas: readonly SettlementDelta[],
  reservations: ReadonlyMap<string, number> = new Map(),
): Promise<void> => {
  const cash = new Map<string, number>(deltas.map((d) => [d.accountId, d.cashDelta]));
  for (const id of new Set([...cash.keys(), ...reservations.keys()])) {
    const c = cash.get(id) ?? 0;
    const r = reservations.get(id) ?? 0;
    if (c === 0 && r === 0) continue;
    await db.query(
      `UPDATE accounts SET cash_minor = cash_minor + $2, reserved_cash_minor = reserved_cash_minor + $3
        WHERE id = $1`,
      [id, c, r],
    );
  }
  for (const d of deltas) {
    if (d.positionDelta === 0) continue;
    // UPDATE first: an INSERT ... ON CONFLICT would CHECK the negative proposed row
    // (a seller's delta) before resolving the conflict.
    const updated = await db.query(
      `UPDATE positions SET quantity = quantity + $3, updated_at = now()
        WHERE account_id = $1 AND instrument_id = $2`,
      [d.accountId, instrumentId, d.positionDelta],
    );
    if (updated.rowCount === 0) {
      await db.query(
        'INSERT INTO positions (account_id, instrument_id, quantity) VALUES ($1, $2, $3)',
        [d.accountId, instrumentId, d.positionDelta],
      );
    }
  }
};

export const setPosition = async (
  db: Queryable,
  accountId: string,
  instrumentId: string,
  quantity: number,
): Promise<void> => {
  await db.query(
    `INSERT INTO positions (account_id, instrument_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (account_id, instrument_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
    [accountId, instrumentId, quantity],
  );
};
