import { allResting, initialState, replay } from '@tickbook/shared';
import type { Queryable } from '../db/pool.js';
import { listInstruments } from '../modules/instruments/instruments.repository.js';
import { readJournal } from './journal.repository.js';
import { specOf, Venue } from './venue.js';

export interface RecoveryReport {
  readonly symbol: string;
  readonly commands: number;
  readonly restingOrders: number;
}

/**
 * Rebuilds every instrument's book by replaying its journal through the pure
 * engine. A gap in sequence numbers means the journal is corrupt: refuse to start.
 */
export const recoverVenue = async (
  db: Queryable,
  depthLevels: number,
): Promise<{ venue: Venue; report: RecoveryReport[] }> => {
  const venue = new Venue(depthLevels);
  const report: RecoveryReport[] = [];
  for (const instrument of await listInstruments(db)) {
    const entries = await readJournal(db, instrument.id);
    entries.forEach((e, i) => {
      if (e.seq !== i + 1) {
        throw new Error(
          `Journal gap for ${instrument.symbol}: expected seq ${i + 1}, found ${e.seq}`,
        );
      }
    });
    const spec = specOf(instrument);
    const state = replay(
      spec,
      entries.map((e) => e.command),
      initialState(spec.symbol),
    );
    const { rows } = await db.query<{ price: number }>(
      'SELECT price FROM trades WHERE instrument_id = $1 ORDER BY trade_id DESC LIMIT 1',
      [instrument.id],
    );
    venue.register(instrument, state, rows[0]?.price ?? null);
    report.push({
      symbol: instrument.symbol,
      commands: entries.length,
      restingOrders: allResting(state.book).length,
    });
  }
  return { venue, report };
};

/**
 * Compares the recovered in-memory books with the persisted open orders.
 * Returns human-readable mismatches (empty = consistent).
 */
export const reconcile = async (db: Queryable, venue: Venue): Promise<string[]> => {
  const { rows } = await db.query<{ id: string; symbol: string; remaining_quantity: number }>(
    `SELECT o.id, i.symbol, o.remaining_quantity
       FROM orders o JOIN instruments i ON i.id = o.instrument_id
      WHERE o.status IN ('new', 'partially_filled')`,
  );
  const persisted = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const symbol of venue.symbols()) {
    for (const o of allResting(venue.view(symbol)!.state.book)) {
      const row = persisted.get(o.orderId);
      if (!row) problems.push(`${symbol}: resting order ${o.orderId} is not open in the database`);
      else if (row.remaining_quantity !== o.remaining) {
        problems.push(
          `${symbol}: order ${o.orderId} remaining ${o.remaining} != ${row.remaining_quantity}`,
        );
      }
      persisted.delete(o.orderId);
    }
  }
  for (const row of persisted.values()) {
    problems.push(`${row.symbol}: open order ${row.id} is missing from the book`);
  }
  const accounts = await db.query<{ id: string; reserved_cash_minor: number }>(
    'SELECT id, reserved_cash_minor FROM accounts',
  );
  for (const a of accounts.rows) {
    const implied = venue.bookReservedCash(a.id);
    if (implied !== a.reserved_cash_minor) {
      problems.push(
        `account ${a.id}: reserved cash ${a.reserved_cash_minor} != ${implied} implied by resting buys`,
      );
    }
  }
  return problems;
};
