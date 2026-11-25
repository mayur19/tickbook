export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface Envelope<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly meta?: Record<string, unknown>;
}

/** Messages pushed over the market-data WebSocket. */
export type MarketMessage =
  | {
      readonly type: 'snapshot';
      readonly symbol: string;
      readonly seq: number;
      readonly bids: readonly { price: number; quantity: number; orders: number }[];
      readonly asks: readonly { price: number; quantity: number; orders: number }[];
    }
  | {
      readonly type: 'depth';
      readonly symbol: string;
      readonly seq: number;
      readonly updates: readonly {
        side: 'buy' | 'sell';
        price: number;
        quantity: number;
        orders: number;
      }[];
    }
  | {
      readonly type: 'trade';
      readonly symbol: string;
      readonly seq: number;
      readonly tradeId: number;
      readonly price: number;
      readonly quantity: number;
      readonly aggressorSide: 'buy' | 'sell';
      readonly ts: string;
    };
