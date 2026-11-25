/**
 * Core matching-engine types.
 *
 * Units: prices are integer minor currency units (e.g. cents) and quantities are
 * integer instrument units (e.g. shares). Floating point never enters the engine.
 */

export type Side = 'buy' | 'sell';

/** Order types implemented by the engine today. Stop, stop-limit, iceberg and post-only are planned. */
export type OrderType = 'limit' | 'market';

/** GTC rests until cancelled; IOC fills what it can and cancels the rest; FOK fills fully or not at all. */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface InstrumentSpec {
  readonly symbol: string;
  /** Minimum price increment in minor units. */
  readonly tickSize: number;
  /** Minimum quantity increment. */
  readonly lotSize: number;
  /** Largest quantity accepted in a single order. */
  readonly maxOrderQty: number;
}

export interface NewOrder {
  readonly orderId: string;
  readonly accountId: string;
  readonly side: Side;
  readonly type: OrderType;
  readonly tif: TimeInForce;
  /** Required for limit orders, absent for market orders. */
  readonly price?: number;
  readonly quantity: number;
}

export interface RestingOrder {
  readonly orderId: string;
  readonly accountId: string;
  readonly side: Side;
  readonly price: number;
  readonly remaining: number;
  /** Engine sequence number of the command that created the order: the time-priority key. */
  readonly seq: number;
}

export interface PriceLevel {
  readonly price: number;
  /** FIFO queue: index 0 has the highest time priority. */
  readonly orders: readonly RestingOrder[];
  readonly total: number;
}

export interface OrderBook {
  /** Sorted by price descending (best bid first). */
  readonly bids: readonly PriceLevel[];
  /** Sorted by price ascending (best ask first). */
  readonly asks: readonly PriceLevel[];
}

export type RejectReason =
  | 'invalid_quantity'
  | 'quantity_not_lot_multiple'
  | 'quantity_above_max'
  | 'price_required'
  | 'price_not_allowed'
  | 'invalid_price'
  | 'price_not_tick_multiple'
  | 'invalid_tif_for_market'
  | 'duplicate_order_id';

export type CancelReason =
  'ioc_remainder' | 'fok_unfillable' | 'market_no_liquidity' | 'user_requested';

export interface PlaceCommand {
  readonly kind: 'place';
  readonly order: NewOrder;
  /** Wall-clock time recorded at journal time; the engine never reads the clock itself. */
  readonly ts: string;
}

export interface CancelCommand {
  readonly kind: 'cancel';
  readonly orderId: string;
  readonly accountId: string;
  readonly ts: string;
}

export type EngineCommand = PlaceCommand | CancelCommand;

export interface AcceptedEvent {
  readonly type: 'accepted';
  readonly orderId: string;
}

export interface RejectedEvent {
  readonly type: 'rejected';
  readonly orderId: string;
  readonly reason: RejectReason;
}

export interface TradeEvent {
  readonly type: 'trade';
  readonly tradeId: number;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide: Side;
  readonly makerOrderId: string;
  readonly makerAccountId: string;
  readonly takerOrderId: string;
  readonly takerAccountId: string;
  readonly makerRemaining: number;
  readonly takerRemaining: number;
}

export interface RestedEvent {
  readonly type: 'rested';
  readonly orderId: string;
  readonly side: Side;
  readonly price: number;
  readonly remaining: number;
}

export interface CancelledEvent {
  readonly type: 'cancelled';
  readonly orderId: string;
  readonly remaining: number;
  readonly reason: CancelReason;
}

export interface CancelRejectedEvent {
  readonly type: 'cancel_rejected';
  readonly orderId: string;
  readonly reason: 'unknown_order' | 'not_owner';
}

export type EngineEvent =
  AcceptedEvent | RejectedEvent | TradeEvent | RestedEvent | CancelledEvent | CancelRejectedEvent;

export interface EngineState {
  readonly symbol: string;
  readonly book: OrderBook;
  /** Sequence number of the last applied command (0 = empty journal). */
  readonly seq: number;
  /** Last trade id issued for this instrument. */
  readonly lastTradeId: number;
}

export interface CommandResult {
  readonly state: EngineState;
  readonly events: readonly EngineEvent[];
}
