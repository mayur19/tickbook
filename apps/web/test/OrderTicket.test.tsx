import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Instrument } from '../src/api/types.js';
import { OrderTicket, ticketError } from '../src/components/OrderTicket.js';

const instrument: Instrument = {
  id: 'i1',
  symbol: 'ACME',
  name: 'Acme',
  currency: 'USD',
  tickSize: 5,
  lotSize: 10,
  maxOrderQty: 1_000,
  referencePrice: 5_000,
  status: 'open',
  lastPrice: null,
  quote: { bid: null, ask: null },
};

describe('ticketError', () => {
  it.each([
    ['limit', '50.00', '0', 'positive whole'],
    ['limit', '50.00', '15', 'lot size'],
    ['limit', '50.00', '2000', 'maximum'],
    ['limit', 'abc', '10', 'Enter a price'],
    ['limit', '50.02', '10', 'tick size'],
  ] as const)('%s %s x %s -> %s', (kind, price, qty, fragment) => {
    expect(ticketError(instrument, kind, price, qty)).toContain(fragment);
  });

  it('accepts valid limit and market tickets', () => {
    expect(ticketError(instrument, 'limit', '50.05', '20')).toBeNull();
    expect(ticketError(instrument, 'market', '', '20')).toBeNull();
  });
});

describe('OrderTicket', () => {
  it('submits a limit order in minor units and shows the result', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Order new: filled 0 of 20');
    render(<OrderTicket instrument={instrument} accountId="acc-1" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: '50.05' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sell ACME' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('filled 0 of 20'));
    expect(onSubmit).toHaveBeenCalledWith({
      accountId: 'acc-1',
      symbol: 'ACME',
      side: 'sell',
      type: 'limit',
      timeInForce: 'GTC',
      quantity: 20,
      price: 5_005,
    });
  });

  it('switches market orders to IOC and omits the price', async () => {
    const onSubmit = vi.fn().mockResolvedValue('ok');
    render(<OrderTicket instrument={instrument} accountId="acc-1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'market' } });
    expect(screen.queryByLabelText(/Price/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Time in force')).toHaveValue('IOC');
    fireEvent.click(screen.getByRole('button', { name: 'Buy ACME' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('price');
  });

  it('blocks invalid tickets and surfaces server errors', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Order failed pre-trade risk checks'));
    render(
      <OrderTicket
        instrument={instrument}
        accountId="acc-1"
        prefillPrice={5_010}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText(/Price/)).toHaveValue('50.10');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '15' } });
    expect(screen.getByRole('button', { name: 'Buy ACME' })).toBeDisabled();
    expect(screen.getByText(/lot size/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy ACME' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('risk checks'));
  });
});
