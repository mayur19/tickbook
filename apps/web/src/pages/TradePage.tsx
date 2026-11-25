import { formatMinor, type PlaceOrderInput } from '@tickbook/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { Account, Instrument, Order, Trade } from '../api/types.js';
import { DepthLadder } from '../components/DepthLadder.js';
import { OrdersTable } from '../components/OrdersTable.js';
import { OrderTicket } from '../components/OrderTicket.js';
import { TradesTape } from '../components/TradesTape.js';
import type { TapeTrade } from '../hooks/market-state.js';
import { useMarketStream } from '../hooks/useMarketStream.js';
import { useSession } from '../hooks/useSession.js';

const toTape = (t: Trade): TapeTrade => ({ ...t, ts: t.executedAt });

export const TradePage = () => {
  const { me } = useSession();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [symbol, setSymbol] = useState('TBK');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<TapeTrade[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const market = useMarketStream(symbol, history);
  const canTrade = me?.permissions.includes('orders:place') ?? false;

  const reload = useCallback(async () => {
    try {
      const [acc, ord] = await Promise.all([
        api<Account[]>('GET', '/api/v1/accounts'),
        api<Order[]>('GET', `/api/v1/orders?status=open&symbol=${symbol}`),
      ]);
      setAccounts(acc);
      setOrders(ord);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [symbol]);

  useEffect(() => {
    api<Instrument[]>('GET', '/api/v1/instruments')
      .then(setInstruments)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    void reload();
    api<Trade[]>('GET', `/api/v1/instruments/${symbol}/trades?limit=30`)
      .then((t) => setHistory(t.map(toTape)))
      .catch((e: Error) => setError(e.message));
  }, [symbol, reload]);

  useEffect(() => {
    if (market.trades.length > 0) void reload();
  }, [market.trades.length, reload]);

  const instrument = instruments.find((i) => i.symbol === symbol);
  const account = accounts[0];

  const submit = async (input: PlaceOrderInput): Promise<string> => {
    const res = await api<{ order: Order; trades: unknown[] }>(
      'POST',
      '/api/v1/orders',
      input,
    ).catch((err: unknown) => {
      const details =
        err instanceof ApiError ? (err.details as { violations?: string[] }) : undefined;
      if (details?.violations) {
        throw new Error(
          `${(err as Error).message}: ${details.violations.join(', ').replace(/_/g, ' ')}`,
        );
      }
      throw err;
    });
    await reload();
    const o = res.order;
    return `Order ${o.status.replace('_', ' ')}: filled ${o.filledQuantity} of ${o.quantity} in ${res.trades.length} trade(s)`;
  };

  const cancel = async (id: string) => {
    try {
      await api('DELETE', `/api/v1/orders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    }
    await reload();
  };

  return (
    <div className="trade">
      <header className="page-head">
        <div className="tabs" role="tablist" aria-label="Instruments">
          {instruments.map((i) => (
            <button
              key={i.symbol}
              role="tab"
              aria-selected={i.symbol === symbol}
              className={`tab ${i.symbol === symbol ? 'active' : ''}`}
              onClick={() => setSymbol(i.symbol)}
            >
              {i.symbol}
            </button>
          ))}
        </div>
        <div className="stats">
          {instrument && <span className="muted">{instrument.name}</span>}
          <span
            className={`dot ${market.connected ? 'live' : ''}`}
            title={market.connected ? 'Live' : 'Disconnected'}
          />
          <span className="muted small">seq {market.seq < 0 ? '—' : market.seq}</span>
          {account && (
            <span className="small">
              Available {formatMinor(account.availableCashMinor)} {account.currency}
            </span>
          )}
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="grid">
        <div className="panel">
          <h2>Depth</h2>
          <DepthLadder depth={market.depth} levels={10} onPickPrice={setPick} />
        </div>
        <div className="panel">
          <h2>Order ticket</h2>
          {instrument && account ? (
            <OrderTicket
              instrument={instrument}
              accountId={account.id}
              prefillPrice={pick}
              disabled={!canTrade}
              onSubmit={submit}
            />
          ) : (
            <p className="muted">Loading…</p>
          )}
          {!canTrade && <p className="muted small">Your role can view but not trade.</p>}
        </div>
        <div className="panel">
          <h2>Trades</h2>
          <TradesTape trades={market.trades} />
        </div>
      </section>
      <section className="panel">
        <h2>My open orders · {symbol}</h2>
        <OrdersTable
          orders={orders}
          emptyText="No open orders"
          {...(canTrade ? { onCancel: (id: string) => void cancel(id) } : {})}
        />
      </section>
    </div>
  );
};
