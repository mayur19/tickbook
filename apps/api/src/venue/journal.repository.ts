import type { EngineCommand } from '@tickbook/shared';
import type { Queryable } from '../db/pool.js';

export const appendJournal = async (
  db: Queryable,
  instrumentId: string,
  seq: number,
  command: EngineCommand,
): Promise<void> => {
  await db.query('INSERT INTO journal (instrument_id, seq, command) VALUES ($1, $2, $3)', [
    instrumentId,
    seq,
    JSON.stringify(command),
  ]);
};

export const readJournal = async (
  db: Queryable,
  instrumentId: string,
): Promise<{ seq: number; command: EngineCommand }[]> => {
  const { rows } = await db.query<{ seq: number; command: EngineCommand }>(
    'SELECT seq, command FROM journal WHERE instrument_id = $1 ORDER BY seq',
    [instrumentId],
  );
  return rows;
};
