import { describe, expect, it } from 'vitest';
import { validateOrder, type NewOrder } from '../src/index.js';
import { SPEC } from './fixtures.js';

const base: NewOrder = {
  orderId: 'x',
  accountId: 'a',
  side: 'buy',
  type: 'limit',
  tif: 'GTC',
  price: 100,
  quantity: 10,
};

describe('validateOrder', () => {
  it.each([
    [{ quantity: 0 }, 'invalid_quantity'],
    [{ quantity: 10.5 }, 'invalid_quantity'],
    [{ quantity: 15 }, 'quantity_not_lot_multiple'],
    [{ quantity: 100_010 }, 'quantity_above_max'],
    [{ price: undefined }, 'price_required'],
    [{ price: -5 }, 'invalid_price'],
    [{ price: 102 }, 'price_not_tick_multiple'],
    [{ type: 'market', price: 100, tif: 'IOC' }, 'price_not_allowed'],
    [{ type: 'market', price: undefined, tif: 'GTC' }, 'invalid_tif_for_market'],
  ] as const)('rejects %o with %s', (patch, reason) => {
    expect(validateOrder(SPEC, { ...base, ...patch } as NewOrder)).toBe(reason);
  });

  it('accepts well-formed limit and market orders', () => {
    expect(validateOrder(SPEC, base)).toBeNull();
    expect(
      validateOrder(SPEC, { ...base, type: 'market', price: undefined, tif: 'FOK' }),
    ).toBeNull();
  });
});
