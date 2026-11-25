import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { Order } from '../api/types.js';
import { OrdersTable } from '../components/OrdersTable.js';

export const BlotterPage = () => {
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Order[]>('GET', `/api/v1/orders?status=${status}&limit=200`)
      .then(setOrders)
      .catch((e: Error) => setError(e.message));
  }, [status]);
  return (
    <div>
      <header className="page-head">
        <h1>Order blotter</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Status filter"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </header>
      {error && <p className="notice error">{error}</p>}
      <section className="panel">
        <OrdersTable orders={orders} />
      </section>
    </div>
  );
};
