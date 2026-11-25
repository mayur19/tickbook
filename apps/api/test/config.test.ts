import { describe, expect, it } from 'vitest';
import { loadConfig, parseTrustProxy } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgres:///x', SESSION_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(base);
    expect(c.API_PORT).toBe(4106);
    expect(c.trustProxy).toBe(false);
    expect(c.isProduction).toBe(false);
  });

  it('lists every invalid setting', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'short' })).toThrow(
      /DATABASE_URL.*SESSION_SECRET|SESSION_SECRET.*DATABASE_URL/,
    );
  });

  it('requires TRUST_PROXY to be set explicitly in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      /TRUST_PROXY must be set/,
    );
    expect(loadConfig({ ...base, NODE_ENV: 'production', TRUST_PROXY: 'false' }).trustProxy).toBe(
      false,
    );
    expect(loadConfig({ ...base, NODE_ENV: 'production', TRUST_PROXY: '1' }).trustProxy).toBe(1);
  });
});

describe('parseTrustProxy', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['2', 2],
    ['127.0.0.1', ['127.0.0.1']],
    ['127.0.0.1, 10.0.0.0/8,::1', ['127.0.0.1', '10.0.0.0/8', '::1']],
  ])('parses %s', (raw, expected) => expect(parseTrustProxy(raw)).toEqual(expected));

  it.each(['true', 'yes', 'not-an-ip', '10.0.0.0/8,bogus'])('rejects %s', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow(/TRUST_PROXY/);
  });
});
