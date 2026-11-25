import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepthLadder } from '../src/components/DepthLadder.js';

const depth = {
  bids: [
    { price: 9_995, quantity: 100, orders: 2 },
    { price: 9_990, quantity: 50, orders: 1 },
  ],
  asks: [
    { price: 10_005, quantity: 200, orders: 3 },
    { price: 10_010, quantity: 25, orders: 1 },
  ],
};

describe('DepthLadder', () => {
  it('renders asks above bids with the best prices nearest the spread', () => {
    render(<DepthLadder depth={depth} />);
    const rows = screen.getAllByRole('row').map((r) => r.textContent);
    expect(rows[1]).toContain('100.10');
    expect(rows[2]).toContain('100.05');
    expect(rows[3]).toContain('Spread 0.10 · Mid 100.00');
    expect(rows[4]).toContain('99.95');
  });

  it('reports the clicked price level', () => {
    const onPick = vi.fn();
    render(<DepthLadder depth={depth} onPickPrice={onPick} />);
    fireEvent.click(screen.getByTestId('bid-9990'));
    expect(onPick).toHaveBeenCalledWith(9_990);
  });

  it('handles an empty or one-sided book', () => {
    render(<DepthLadder depth={{ bids: [], asks: [] }} />);
    expect(screen.getByText('No offers')).toBeInTheDocument();
    expect(screen.getByText('No bids')).toBeInTheDocument();
    expect(screen.getByText('One-sided market')).toBeInTheDocument();
  });

  it('limits the number of levels shown', () => {
    render(<DepthLadder depth={depth} levels={1} />);
    expect(screen.queryByText('100.10')).not.toBeInTheDocument();
    expect(screen.queryByText('99.90')).not.toBeInTheDocument();
  });
});
