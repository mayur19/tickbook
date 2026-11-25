import type { SettlementDelta } from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';

export interface AccountRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  readonly cashMinor: number;
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
  max_order_notional: number;
  max_position: number;
}

const toAccount = (r: AccountRow): AccountRecord => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  currency: r.currency,
  cashMinor: r.cash_minor,
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

/** Applies gross trade settlement to cash and positions (fees and ledger postings are planned). */
export const applySettlement = async (
  db: Queryable,
  instrumentId: string,
  deltas: readonly SettlementDelta[],
): Promise<void> => {
  for (const d of deltas) {
    if (d.cashDelta !== 0) {
      await db.query('UPDATE accounts SET cash_minor = cash_minor + $2 WHERE id = $1', [
        d.accountId,
        d.cashDelta,
      ]);
    }
    if (d.positionDelta !== 0) {
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
