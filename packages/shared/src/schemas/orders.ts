import { z } from 'zod';

/** Full target vocabulary. Only a subset is executable today; see `pendingOrderFeature`. */
export const ORDER_TYPES = ['limit', 'market', 'stop', 'stop_limit'] as const;
export const TIME_IN_FORCE = ['GTC', 'IOC', 'FOK', 'DAY', 'GTD'] as const;

const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const placeOrderSchema = z.object({
  accountId: z.string().uuid(),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.]{1,12}$/),
  side: z.enum(['buy', 'sell']),
  type: z.enum(ORDER_TYPES),
  timeInForce: z.enum(TIME_IN_FORCE).default('GTC'),
  /** Limit price in minor units (e.g. cents). */
  price: minorUnits.optional(),
  /** Stop trigger price in minor units (planned). */
  stopPrice: minorUnits.optional(),
  quantity: z.number().int().positive().max(1_000_000_000),
  /** Iceberg visible quantity (planned). */
  displayQuantity: z.number().int().positive().optional(),
  /** Post-only / add-liquidity-only flag (planned). */
  postOnly: z.boolean().optional(),
  clientOrderId: z.string().trim().min(1).max(64).optional(),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('all'),
  symbol: z.string().trim().toUpperCase().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const depthQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(50).default(10),
});

export interface PendingFeature {
  readonly feature: string;
  readonly ticket: string;
}

/**
 * Identifies order features that are part of the target API but not yet executable,
 * so the API can answer 501 with the tracking ticket instead of silently ignoring them.
 */
export const pendingOrderFeature = (input: PlaceOrderInput): PendingFeature | null => {
  if (input.type === 'stop' || input.type === 'stop_limit') {
    return { feature: 'Stop and stop-limit orders', ticket: 'TB-201' };
  }
  if (input.displayQuantity !== undefined) return { feature: 'Iceberg orders', ticket: 'TB-202' };
  if (input.postOnly) return { feature: 'Post-only orders', ticket: 'TB-203' };
  if (input.timeInForce === 'DAY' || input.timeInForce === 'GTD') {
    return { feature: 'DAY/GTD time in force with session expiry', ticket: 'TB-204' };
  }
  return null;
};
