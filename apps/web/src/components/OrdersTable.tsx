import { formatMinor } from '@tickbook/shared';
import type { Order } from '../api/types.js';

interface Props {
  readonly orders: readonly Order[];
  readonly onCancel?: (id: string) => void;
  readonly emptyText?: string;
}

const avgPrice = (o: Order): string =>
  o.filledQuantity > 0 ? formatMinor(Math.round(o.filledNotional / o.filledQuantity)) : '—';

export const OrdersTable = ({ orders, onCancel, emptyText = 'No orders' }: Props) => (
  <table className="orders" aria-label="Orders">
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Side</th>
        <th>Type</th>
        <th className="num">Price</th>
        <th className="num">Filled / Qty</th>
        <th className="num">Avg</th>
        <th>Status</th>
        {onCancel && <th aria-label="Actions" />}
      </tr>
    </thead>
    <tbody>
      {orders.length === 0 && (
        <tr>
          <td colSpan={onCancel ? 8 : 7} className="muted center">
            {emptyText}
          </td>
        </tr>
      )}
      {orders.map((o) => {
        const open = o.status === 'new' || o.status === 'partially_filled';
        return (
          <tr key={o.id}>
            <td>{o.symbol}</td>
            <td className={o.side === 'buy' ? 'up' : 'down'}>{o.side.toUpperCase()}</td>
            <td>
              {o.type} {o.timeInForce}
            </td>
            <td className="num">{o.price === null ? 'MKT' : formatMinor(o.price)}</td>
            <td className="num">
              {o.filledQuantity} / {o.quantity}
            </td>
            <td className="num">{avgPrice(o)}</td>
            <td>
              <span className={`status ${o.status}`} title={o.rejectReason ?? o.cancelReason ?? ''}>
                {o.status.replace('_', ' ')}
              </span>
            </td>
            {onCancel && (
              <td>
                {open && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => onCancel(o.id)}
                    aria-label={`Cancel order ${o.id}`}
                  >
                    Cancel
                  </button>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </tbody>
  </table>
);
