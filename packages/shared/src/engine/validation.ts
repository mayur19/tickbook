import type { InstrumentSpec, NewOrder, RejectReason } from './types.js';

const isPositiveInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

/**
 * Static order validation against instrument rules. Pure, no book access.
 * Returns the first violated rule or null when the order is well formed.
 */
export const validateOrder = (spec: InstrumentSpec, order: NewOrder): RejectReason | null => {
  if (!isPositiveInt(order.quantity)) return 'invalid_quantity';
  if (order.quantity % spec.lotSize !== 0) return 'quantity_not_lot_multiple';
  if (order.quantity > spec.maxOrderQty) return 'quantity_above_max';

  if (order.type === 'market') {
    if (order.price !== undefined) return 'price_not_allowed';
    if (order.tif === 'GTC') return 'invalid_tif_for_market';
    return null;
  }

  if (order.price === undefined) return 'price_required';
  if (!isPositiveInt(order.price)) return 'invalid_price';
  if (order.price % spec.tickSize !== 0) return 'price_not_tick_multiple';
  return null;
};
