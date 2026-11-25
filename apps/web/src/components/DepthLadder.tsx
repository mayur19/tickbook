import { formatMinor, spreadOf, type DepthLevel, type DepthSnapshot } from '@tickbook/shared';

interface Props {
  readonly depth: DepthSnapshot;
  readonly levels?: number;
  readonly onPickPrice?: (price: number) => void;
}

const Row = ({
  level,
  side,
  max,
  onPick,
}: {
  level: DepthLevel;
  side: 'bid' | 'ask';
  max: number;
  onPick?: (price: number) => void;
}) => (
  <tr
    className={`ladder-row ${side}`}
    onClick={() => onPick?.(level.price)}
    data-testid={`${side}-${level.price}`}
  >
    <td className="num orders">{level.orders}</td>
    <td className="num qty">
      <span
        className="bar"
        style={{ width: `${Math.round((level.quantity / max) * 100)}%` }}
        aria-hidden
      />
      <span className="qty-value">{level.quantity.toLocaleString('en-US')}</span>
    </td>
    <td className="num price">{formatMinor(level.price)}</td>
  </tr>
);

/** Level-2 depth ladder: asks above (best ask nearest the spread), bids below. */
export const DepthLadder = ({ depth, levels = 10, onPickPrice }: Props) => {
  const asks = depth.asks.slice(0, levels);
  const bids = depth.bids.slice(0, levels);
  const max = Math.max(1, ...asks.map((l) => l.quantity), ...bids.map((l) => l.quantity));
  const spread = spreadOf(depth);
  return (
    <table className="ladder" aria-label="Order book depth">
      <thead>
        <tr>
          <th className="num">Orders</th>
          <th className="num">Size</th>
          <th className="num">Price</th>
        </tr>
      </thead>
      <tbody>
        {asks.length === 0 && (
          <tr>
            <td colSpan={3} className="muted center">
              No offers
            </td>
          </tr>
        )}
        {[...asks].reverse().map((l) => (
          <Row
            key={`a${l.price}`}
            level={l}
            side="ask"
            max={max}
            {...(onPickPrice ? { onPick: onPickPrice } : {})}
          />
        ))}
        <tr className="spread-row">
          <td colSpan={3} className="center">
            {spread
              ? `Spread ${formatMinor(spread.spread)} · Mid ${formatMinor(Math.round(spread.mid))}`
              : 'One-sided market'}
          </td>
        </tr>
        {bids.map((l) => (
          <Row
            key={`b${l.price}`}
            level={l}
            side="bid"
            max={max}
            {...(onPickPrice ? { onPick: onPickPrice } : {})}
          />
        ))}
        {bids.length === 0 && (
          <tr>
            <td colSpan={3} className="muted center">
              No bids
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
