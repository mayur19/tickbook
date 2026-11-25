import { applyDepthUpdates, type DepthSnapshot, type MarketMessage } from '@tickbook/shared';

export interface TapeTrade {
  readonly tradeId: number;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide: 'buy' | 'sell';
  readonly ts: string;
}

export interface MarketState {
  readonly symbol: string;
  readonly seq: number;
  readonly ready: boolean;
  readonly depth: DepthSnapshot;
  readonly trades: readonly TapeTrade[];
}

export const TAPE_LENGTH = 50;

export const initialMarket = (symbol: string): MarketState => ({
  symbol,
  seq: -1,
  ready: false,
  depth: { bids: [], asks: [] },
  trades: [],
});

/**
 * Pure reducer for the market-data stream. Messages older than the current
 * snapshot are ignored, so a resnapshot never goes backwards.
 */
export const marketReducer = (state: MarketState, msg: MarketMessage): MarketState => {
  if (msg.symbol !== state.symbol) return state;
  switch (msg.type) {
    case 'snapshot':
      return { ...state, seq: msg.seq, ready: true, depth: { bids: msg.bids, asks: msg.asks } };
    case 'depth':
      if (!state.ready || msg.seq <= state.seq) return state;
      return { ...state, seq: msg.seq, depth: applyDepthUpdates(state.depth, msg.updates) };
    case 'trade': {
      if (state.trades.some((t) => t.tradeId === msg.tradeId)) return state;
      const trade: TapeTrade = {
        tradeId: msg.tradeId,
        price: msg.price,
        quantity: msg.quantity,
        aggressorSide: msg.aggressorSide,
        ts: msg.ts,
      };
      return { ...state, trades: [trade, ...state.trades].slice(0, TAPE_LENGTH) };
    }
  }
};

export const seedTrades = (state: MarketState, trades: readonly TapeTrade[]): MarketState => {
  const known = new Set(state.trades.map((t) => t.tradeId));
  const merged = [...state.trades, ...trades.filter((t) => !known.has(t.tradeId))];
  return { ...state, trades: merged.sort((a, b) => b.tradeId - a.tradeId).slice(0, TAPE_LENGTH) };
};
