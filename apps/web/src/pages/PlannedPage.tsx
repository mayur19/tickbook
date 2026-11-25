import { useParams } from 'react-router-dom';
import { PlannedBadge } from '../components/PlannedBadge.js';

const DESCRIPTIONS: Record<string, { title: string; text: string; tickets: string }> = {
  charts: {
    title: 'Charts & candles',
    text: 'OHLCV candle aggregation from the trade tape, L1 statistics and an SVG chart.',
    tickets: 'TB-401, TB-402, TB-405',
  },
  ledger: {
    title: 'Ledger & P&L',
    text: 'Double-entry settlement ledger, maker/taker fees, realised and unrealised P&L.',
    tickets: 'TB-301 to TB-312',
  },
  auctions: {
    title: 'Auctions & halts',
    text: 'Opening cross uncrossing, trading halts and dynamic circuit breakers.',
    tickets: 'TB-510 to TB-524',
  },
  surveillance: {
    title: 'Surveillance',
    text: 'Cross-firm order search, spoofing/layering and wash-trade alerts.',
    tickets: 'TB-701 to TB-720',
  },
  admin: {
    title: 'Venue admin',
    text: 'Instrument listing, rule changes, journal browser and engine snapshots.',
    tickets: 'TB-501, TB-502, TB-601, TB-602',
  },
  members: {
    title: 'Members & API keys',
    text: 'Invite members, change roles, issue API keys for strategy clients.',
    tickets: 'TB-801 to TB-812',
  },
};

export const PlannedPage = () => {
  const { section = '' } = useParams();
  const info = DESCRIPTIONS[section] ?? {
    title: 'Planned',
    text: 'This area is on the roadmap.',
    tickets: '—',
  };
  return (
    <div>
      <header className="page-head">
        <h1>{info.title}</h1>
        <PlannedBadge />
      </header>
      <section className="panel">
        <p>{info.text}</p>
        <p className="muted small">Tracked in docs/planning/backlog.md: {info.tickets}</p>
      </section>
    </div>
  );
};
