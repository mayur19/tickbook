import { formatMinor } from '@tickbook/shared';
import type { TapeTrade } from '../hooks/market-state.js';

export const TradesTape = ({ trades }: { trades: readonly TapeTrade[] }) => (
  <table className="tape" aria-label="Recent trades">
    <thead>
      <tr>
        <th>Time</th>
        <th className="num">Price</th>
        <th className="num">Size</th>
      </tr>
    </thead>
    <tbody>
      {trades.length === 0 && (
        <tr>
          <td colSpan={3} className="muted center">
            No trades yet
          </td>
        </tr>
      )}
      {trades.map((t) => (
        <tr key={t.tradeId} className={t.aggressorSide === 'buy' ? 'up' : 'down'}>
          <td>{new Date(t.ts).toLocaleTimeString('en-GB', { hour12: false })}</td>
          <td className="num">{formatMinor(t.price)}</td>
          <td className="num">{t.quantity.toLocaleString('en-US')}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
