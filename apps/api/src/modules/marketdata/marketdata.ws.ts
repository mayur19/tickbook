import type { MarketMessage } from '@tickbook/shared';
import { hasPermission } from '@tickbook/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.js';

/** Application close codes (4000-4999 range reserved for applications). */
export const WS_UNAUTHENTICATED = 4401;
export const WS_UNKNOWN_SYMBOL = 4404;
const MAX_BUFFERED_BYTES = 1_000_000;

/**
 * Level-2 market data stream: on connect the client receives a full snapshot,
 * then incremental depth updates and trades, each tagged with the engine
 * sequence number so gaps can be detected and a resnapshot requested.
 */
export const registerMarketDataSocket = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/ws/market', { websocket: true }, (socket, req) => {
    if (!req.auth || !hasPermission(req.auth.role, 'marketdata:read')) {
      socket.close(WS_UNAUTHENTICATED, 'authentication required');
      return;
    }
    const symbol = String((req.query as Record<string, unknown>).symbol ?? '').toUpperCase();
    const snapshot = deps.venue.snapshot(symbol);
    if (!snapshot) {
      socket.close(WS_UNKNOWN_SYMBOL, 'unknown symbol');
      return;
    }
    const send = (msg: MarketMessage) => {
      // Slow consumers are disconnected rather than buffering without bound.
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        socket.close(1013, 'consumer too slow');
        return;
      }
      socket.send(JSON.stringify(msg));
    };
    send(snapshot);
    const unsubscribe = deps.venue.subscribe(symbol, send);
    socket.on('close', unsubscribe);
    socket.on('message', (raw: Buffer) => {
      if (raw.toString() === 'snapshot') {
        const fresh = deps.venue.snapshot(symbol);
        if (fresh) send(fresh);
      }
    });
  });
};
