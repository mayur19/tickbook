import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client.js';

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ status, ok: status < 400, json: () => Promise.resolve(body) });

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'tb_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('api client', () => {
  it('unwraps the data envelope', async () => {
    vi.stubGlobal('fetch', respond(200, { data: { ok: 1 }, error: null }));
    await expect(api('GET', '/x')).resolves.toEqual({ ok: 1 });
  });

  it('sends the csrf cookie as a header on mutations', async () => {
    document.cookie = 'tb_csrf=tok123';
    const fetchMock = respond(201, { data: {}, error: null });
    vi.stubGlobal('fetch', fetchMock);
    await api('POST', '/x', { a: 1 });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('tok123');
    expect(init.body).toBe('{"a":1}');
  });

  it('raises ApiError with code and details', async () => {
    vi.stubGlobal(
      'fetch',
      respond(422, {
        data: null,
        error: { code: 'RISK_REJECTED', message: 'nope', details: { v: 1 } },
      }),
    );
    await expect(api('POST', '/x', {})).rejects.toMatchObject({
      status: 422,
      code: 'RISK_REJECTED',
      details: { v: 1 },
    });
  });

  it('handles 204 and non-JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, ok: true }));
    await expect(api('DELETE', '/x')).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
        json: () => Promise.reject(new Error('html')),
      }),
    );
    const err = await api('GET', '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK');
  });
});
