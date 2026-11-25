import { formatMinor } from '@tickbook/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { Account } from '../api/types.js';
import { PlannedBadge } from '../components/PlannedBadge.js';

export const PortfolioPage = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Account[]>('GET', '/api/v1/accounts')
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div>
      <header className="page-head">
        <h1>Portfolio</h1>
        <span className="muted small">
          Realised/unrealised P&amp;L and the settlement ledger <PlannedBadge />
        </span>
      </header>
      {error && <p className="notice error">{error}</p>}
      {accounts.map((a) => (
        <section key={a.id} className="panel">
          <h2>{a.name}</h2>
          <dl className="kv">
            <dt>Cash</dt>
            <dd>
              {formatMinor(a.cashMinor)} {a.currency}
            </dd>
            <dt>Reserved for open buys</dt>
            <dd>{formatMinor(a.reservedCashMinor)}</dd>
            <dt>Available</dt>
            <dd>{formatMinor(a.availableCashMinor)}</dd>
          </dl>
          <table className="orders">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Position</th>
              </tr>
            </thead>
            <tbody>
              {a.positions.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td className="num">{p.quantity.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
};
