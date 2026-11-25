import type { MarketMessage } from '@tickbook/shared';
import { useEffect, useReducer, useState } from 'react';
import {
  initialMarket,
  marketReducer,
  seedTrades,
  type MarketState,
  type TapeTrade,
} from './market-state.js';

type Action =
  | { kind: 'msg'; msg: MarketMessage }
  | { kind: 'reset'; symbol: string }
  | { kind: 'seed'; trades: TapeTrade[] };

const reducer = (state: MarketState, action: Action): MarketState => {
  if (action.kind === 'reset') return initialMarket(action.symbol);
  if (action.kind === 'seed') return seedTrades(state, action.trades);
  return marketReducer(state, action.msg);
};

const RETRY_MS = 2_000;

/** Subscribes to the L2 depth + trades WebSocket for one symbol, reconnecting on drop. */
export const useMarketStream = (symbol: string, initialTrades: TapeTrade[] = []) => {
  const [state, dispatch] = useReducer(reducer, symbol, initialMarket);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    dispatch({ kind: 'reset', symbol });
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(
        `${proto}://${window.location.host}/ws/market?symbol=${encodeURIComponent(symbol)}`,
      );
      socket.onopen = () => setConnected(true);
      socket.onmessage = (ev: MessageEvent<string>) => {
        try {
          dispatch({ kind: 'msg', msg: JSON.parse(ev.data) as MarketMessage });
        } catch {
          // Ignore malformed frames rather than tearing down the stream.
        }
      };
      socket.onclose = (ev) => {
        setConnected(false);
        if (!stopped && ev.code < 4000) timer = setTimeout(connect, RETRY_MS);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [symbol]);

  useEffect(() => {
    if (initialTrades.length > 0) dispatch({ kind: 'seed', trades: initialTrades });
  }, [initialTrades]);

  return { ...state, connected };
};
