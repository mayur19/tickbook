import type { Queryable } from '../../db/pool.js';

export interface InstrumentRecord {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly currency: string;
  readonly tickSize: number;
  readonly lotSize: number;
  readonly maxOrderQty: number;
  readonly referencePrice: number;
  readonly priceBandBps: number;
  readonly status: 'open' | 'halted' | 'closed';
}

interface Row {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  tick_size: number;
  lot_size: number;
  max_order_qty: number;
  reference_price: number;
  price_band_bps: number;
  status: 'open' | 'halted' | 'closed';
}

const toRecord = (r: Row): InstrumentRecord => ({
  id: r.id,
  symbol: r.symbol,
  name: r.name,
  currency: r.currency,
  tickSize: r.tick_size,
  lotSize: r.lot_size,
  maxOrderQty: r.max_order_qty,
  referencePrice: r.reference_price,
  priceBandBps: r.price_band_bps,
  status: r.status,
});

export const listInstruments = async (db: Queryable): Promise<InstrumentRecord[]> => {
  const { rows } = await db.query<Row>('SELECT * FROM instruments ORDER BY symbol');
  return rows.map(toRecord);
};

export const insertInstrument = async (
  db: Queryable,
  input: Omit<InstrumentRecord, 'id' | 'status'>,
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO instruments (symbol, name, currency, tick_size, lot_size, max_order_qty, reference_price, price_band_bps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.symbol,
      input.name,
      input.currency,
      input.tickSize,
      input.lotSize,
      input.maxOrderQty,
      input.referencePrice,
      input.priceBandBps,
    ],
  );
  return (rows[0] as { id: string }).id;
};
