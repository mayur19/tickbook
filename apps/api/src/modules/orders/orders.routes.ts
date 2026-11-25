import { listOrdersQuerySchema, placeOrderSchema } from '@tickbook/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { requirePermission } from '../../http/auth-context.js';
import { ok } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { parse } from '../../http/validate.js';
import { findOrder, listOrders } from './orders.repository.js';
import { cancelOrder, placeOrder } from './orders.service.js';

const idParams = z.object({ id: z.string().uuid() });

export const registerOrderRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.post('/api/v1/orders', async (req, reply) => {
    const auth = requirePermission(req, 'orders:place');
    const input = parse(placeOrderSchema, req.body);
    const result = await placeOrder(deps, auth, input, req.id);
    return reply.status(201).send(ok(result));
  });

  app.get('/api/v1/orders', async (req) => {
    const auth = requirePermission(req, 'orders:read');
    const query = parse(listOrdersQuerySchema, req.query);
    const orders = await listOrders(deps.pool, auth.organizationId, query);
    return ok(orders, { count: orders.length, limit: query.limit });
  });

  app.get('/api/v1/orders/:id', async (req) => {
    const auth = requirePermission(req, 'orders:read');
    const { id } = parse(idParams, req.params);
    const order = await findOrder(deps.pool, auth.organizationId, id);
    if (!order) throw notFound('Order not found');
    return ok(order);
  });

  app.delete('/api/v1/orders/:id', async (req) => {
    const auth = requirePermission(req, 'orders:cancel');
    const { id } = parse(idParams, req.params);
    return ok(await cancelOrder(deps, auth, id, req.id));
  });
};
