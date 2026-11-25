import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { PlannedBadge } from './PlannedBadge.js';

export const NAV = [
  { to: '/trade', label: 'Trade', planned: false },
  { to: '/orders', label: 'Order blotter', planned: false },
  { to: '/portfolio', label: 'Portfolio', planned: false },
  { to: '/planned/charts', label: 'Charts & candles', planned: true },
  { to: '/planned/ledger', label: 'Ledger & P&L', planned: true },
  { to: '/planned/auctions', label: 'Auctions & halts', planned: true },
  { to: '/planned/surveillance', label: 'Surveillance', planned: true },
  { to: '/planned/admin', label: 'Venue admin', planned: true },
  { to: '/planned/members', label: 'Members & API keys', planned: true },
] as const;

export const Layout = () => {
  const { me, logout } = useSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ▮▮▮
          </span>{' '}
          Tickbook
        </div>
        <p className="sim-flag">Simulated venue · paper trading only</p>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
              {item.planned && <PlannedBadge />}
            </NavLink>
          ))}
        </nav>
        {me && (
          <div className="whoami">
            <div>{me.user.displayName}</div>
            <div className="muted small">
              {me.organization.name} · {me.role}
            </div>
            <button type="button" className="link" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
};
