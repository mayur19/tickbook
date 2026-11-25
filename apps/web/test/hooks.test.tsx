import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout, NAV } from '../src/components/Layout.js';
import { useMarketStream } from '../src/hooks/useMarketStream.js';
import { SessionProvider, useSession } from '../src/hooks/useSession.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useMarketStream', () => {
  it('connects per symbol, applies messages and reconnects after a drop', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ s }) => useMarketStream(s), {
      initialProps: { s: 'TBK' },
    });
    const ws = FakeSocket.instances[0]!;
    expect(ws.url).toContain('/ws/market?symbol=TBK');
    act(() => {
      ws.onopen?.();
      ws.emit({
        type: 'snapshot',
        symbol: 'TBK',
        seq: 3,
        bids: [{ price: 100, quantity: 5, orders: 1 }],
        asks: [],
      });
      ws.emit('not json');
    });
    expect(result.current).toMatchObject({ connected: true, seq: 3, ready: true });
    act(() => ws.onclose?.({ code: 1006 }));
    expect(result.current.connected).toBe(false);
    act(() => vi.advanceTimersByTime(2_000));
    expect(FakeSocket.instances).toHaveLength(2);
    rerender({ s: 'ACME' });
    expect(FakeSocket.instances[1]!.closed).toBe(true);
    expect(FakeSocket.instances[2]!.url).toContain('symbol=ACME');
    unmount();
    expect(FakeSocket.instances[2]!.closed).toBe(true);
  });

  it('does not reconnect after an application close code', () => {
    vi.useFakeTimers();
    renderHook(() => useMarketStream('TBK'));
    act(() => FakeSocket.instances[0]!.onclose?.({ code: 4401 }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('seeds historical trades', () => {
    const history = [
      { tradeId: 1, price: 100, quantity: 1, aggressorSide: 'buy' as const, ts: 't' },
    ];
    const { result } = renderHook(() => useMarketStream('TBK', history));
    expect(result.current.trades).toHaveLength(1);
  });
});

const me = {
  user: { id: 'u', email: 'demo@tickbook.local', displayName: 'Dana Demo' },
  organization: { id: 'o', name: 'Northwind Capital' },
  role: 'owner',
  permissions: [],
  csrfToken: 'c',
};

describe('session and layout', () => {
  it('loads the current user and renders navigation with planned badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: me, error: null }),
      }),
    );
    render(
      <SessionProvider>
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('Dana Demo')).toBeInTheDocument());
    expect(screen.getAllByText('Planned')).toHaveLength(NAV.filter((n) => n.planned).length);
    expect(screen.getByText(/paper trading only/)).toBeInTheDocument();
  });

  it('treats 401 as signed out and supports login/logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: () =>
          Promise.resolve({ data: null, error: { code: 'UNAUTHENTICATED', message: 'x' } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: {}, error: null }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: me, error: null }),
      })
      .mockResolvedValueOnce({ status: 204, ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.me).toBeNull();
    await act(() => result.current.login('demo@tickbook.local', 'pw'));
    expect(result.current.me?.user.displayName).toBe('Dana Demo');
    await act(() => result.current.logout());
    expect(result.current.me).toBeNull();
  });

  it('requires the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
