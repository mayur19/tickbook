import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Order } from '../src/api/types.js';
import { OrdersTable } from '../src/components/OrdersTable.js';
import { TradesTape } from '../src/components/TradesTape.js';

const order = (patch: Partial<Order>): Order => ({
  id: 'o1',
  clientOrderId: null,
  accountId: 'a',
  symbol: 'TBK',
  side: 'buy',
  type: 'limit',
  timeInForce: 'GTC',
  price: 10_000,
  quantity: 100,
  filledQuantity: 40,
  filledNotional: 399_800,
  remainingQuantity: 60,
  status: 'partially_filled',
  rejectReason: null,
  cancelReason: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...patch,
});

describe('OrdersTable', () => {
  it('shows fills, average price and a cancel action only for open orders', () => {
    const onCancel = vi.fn();
    render(
      <OrdersTable
        orders={[
          order({}),
          order({
            id: 'o2',
            status: 'filled',
            type: 'market',
            price: null,
            filledQuantity: 100,
            filledNotional: 1_000_000,
          }),
        ]}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('40 / 100')).toBeInTheDocument();
    expect(screen.getByText('99.95')).toBeInTheDocument();
    expect(screen.getByText('MKT')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /Cancel order/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onCancel).toHaveBeenCalledWith('o1');
  });

  it('renders an empty state', () => {
    render(<OrdersTable orders={[]} emptyText="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('TradesTape', () => {
  it('lists trades coloured by aggressor', () => {
    render(
      <TradesTape
        trades={[
          {
            tradeId: 1,
            price: 10_005,
            quantity: 30,
            aggressorSide: 'sell',
            ts: '2026-01-01T10:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('100.05').closest('tr')).toHaveClass('down');
  });

  it('renders an empty state', () => {
    render(<TradesTape trades={[]} />);
    expect(screen.getByText('No trades yet')).toBeInTheDocument();
  });
});
