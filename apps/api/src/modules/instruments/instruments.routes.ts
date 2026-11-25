import { bestAsk, bestBid, depthQuerySchema, toDepth, type OrderBook } from '@tickbook/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { requirePermission } from '../../http/auth-context.js';
import { ok } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { parse } from '../../http/validate.js';
import { recentTrades } from '../orders/orders.repository.js';

const symbolParams = z.object({ symbol: z.string().trim().toUpperCase() });
const quoteOf = (book: OrderBook) => ({ bid: bestBid(book), ask: bestAsk(book) });
const tradesQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });

export const registerInstrumentRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  const viewOf = (symbol: string) => {
    const view = deps.venue.view(symbol);
    if (!view) throw notFound(`Unknown instrument ${symbol}`);
    return view;
  };

  app.get('/api/v1/instruments', async (req) => {
    requirePermission(req, 'marketdata:read');
    const data = deps.venue.symbols().map((s) => {
      const v = viewOf(s);
      return { ...v.instrument, lastPrice: v.lastPrice, quote: quoteOf(v.state.book) };
    });
    return ok(data);
  });

  app.get('/api/v1/instruments/:symbol', async (req) => {
    requirePermission(req, 'marketdata:read');
    const { symbol } = parse(symbolParams, req.params);
    const v = viewOf(symbol);
    return ok({ ...v.instrument, lastPrice: v.lastPrice, quote: quoteOf(v.state.book) });
  });

  app.get('/api/v1/instruments/:symbol/book', async (req) => {
    requirePermission(req, 'marketdata:read');
    const { symbol } = parse(symbolParams, req.params);
    const { depth } = parse(depthQuerySchema, req.query);
    const v = viewOf(symbol);
    return ok({ symbol, seq: v.state.seq, ...toDepth(v.state.book, depth) });
  });

  app.get('/api/v1/instruments/:symbol/trades', async (req) => {
    requirePermission(req, 'marketdata:read');
    const { symbol } = parse(symbolParams, req.params);
    const { limit } = parse(tradesQuery, req.query);
    const v = viewOf(symbol);
    return ok(await recentTrades(deps.pool, v.instrument.id, limit));
  });
};
