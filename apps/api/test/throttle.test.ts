import { describe, expect, it, vi } from 'vitest';
import { BoundedStore } from '../src/http/bounded-store.js';
import { normalizeIp } from '../src/http/client-ip.js';
import {
  backoffMs,
  createIpWindowLimiter,
  createLoginThrottle,
  DEFAULT_THROTTLE,
  type LoginThrottleOptions,
} from '../src/http/login-throttle.js';

const opts = (o: Partial<LoginThrottleOptions> = {}): LoginThrottleOptions => ({
  ...DEFAULT_THROTTLE,
  ipAttemptsPerWindow: 100,
  ...o,
});

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:10.0.0.1', '10.0.0.1'],
    ['2001:db8:1:2:3:4:5:6', '2001:0db8:0001:0002::/64'],
    ['2001:db8:1:2::99', '2001:0db8:0001:0002::/64'],
    ['[2001:db8::1]', '2001:0db8:0000:0000::/64'],
    ['fe80::1%eth0', 'fe80:0000:0000:0000::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    ['garbage', 'unknown'],
    [undefined, 'unknown'],
  ])('%s -> %s', (raw, key) => expect(normalizeIp(raw)).toBe(key));

  it('collapses addresses in the same /64 to one key', () => {
    expect(normalizeIp('2001:db8:aa:bb::1')).toBe(
      normalizeIp('2001:db8:aa:bb:ffff:ffff:ffff:ffff'),
    );
    expect(normalizeIp('2001:db8:aa:bb::1')).not.toBe(normalizeIp('2001:db8:aa:bc::1'));
  });
});

describe('login throttle', () => {
  it('backs off exponentially per email after the free failures, capped', () => {
    const o = opts();
    expect(backoffMs(4, o)).toBe(0);
    expect(backoffMs(5, o)).toBe(1_000);
    expect(backoffMs(6, o)).toBe(2_000);
    expect(backoffMs(8, o)).toBe(8_000);
    expect(backoffMs(40, o)).toBe(o.backoffMaxMs);
  });

  it('locks an email out progressively and releases on success', () => {
    const t = createLoginThrottle(opts());
    const now = 1_000_000;
    for (let i = 0; i < 4; i += 1) expect(t.reserve('1.1.1.1', 'a@x', now).allowed).toBe(true);
    expect(t.reserve('1.1.1.1', 'a@x', now).allowed).toBe(true); // 5th failure arms a 1s lock
    const denied = t.reserve('2.2.2.2', 'a@x', now + 500);
    expect(denied).toEqual({ allowed: false, reason: 'email_backoff', retryAfterSeconds: 1 });
    const sixth = t.reserve('2.2.2.2', 'a@x', now + 1_000);
    expect(sixth.allowed).toBe(true);
    expect(t.reserve('2.2.2.2', 'a@x', now + 2_500)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    // A successful login clears the email history.
    if (sixth.allowed) sixth.succeeded();
    expect(t.reserve('2.2.2.2', 'a@x', now + 2_500).allowed).toBe(true);
  });

  it('counts the attempt at reservation time so concurrent callers cannot all pass', () => {
    const t = createLoginThrottle(opts({ emailFreeFailures: 3, backoffBaseMs: 60_000 }));
    const decisions = Array.from({ length: 10 }, () => t.reserve('1.1.1.1', 'victim@x', 5_000));
    expect(decisions.filter((d) => d.allowed)).toHaveLength(3);
  });

  it('limits attempts per IP across many emails (password spraying)', () => {
    const t = createLoginThrottle(opts({ ipAttemptsPerWindow: 5, ipDistinctEmailsPerWindow: 100 }));
    const results = Array.from({ length: 8 }, (_, i) => t.reserve('9.9.9.9', `u${i}@x`, 0));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results[5]).toMatchObject({ allowed: false, reason: 'ip_rate', retryAfterSeconds: 60 });
    expect(t.reserve('9.9.9.9', 'u0@x', 60_000).allowed).toBe(true);
  });

  it('treats an IPv6 /64 as one client', () => {
    const t = createLoginThrottle(opts({ ipAttemptsPerWindow: 2 }));
    expect(t.reserve('2001:db8::1', 'a@x', 0).allowed).toBe(true);
    expect(t.reserve('2001:db8::2', 'b@x', 0).allowed).toBe(true);
    expect(t.reserve('2001:db8::3', 'c@x', 0)).toMatchObject({ allowed: false, reason: 'ip_rate' });
  });

  it('caps distinct email keys one IP can create per window', () => {
    const t = createLoginThrottle(opts({ ipDistinctEmailsPerWindow: 3 }));
    for (const e of ['a', 'b', 'c']) expect(t.reserve('8.8.8.8', e, 0).allowed).toBe(true);
    expect(t.reserve('8.8.8.8', 'd', 0)).toMatchObject({
      allowed: false,
      reason: 'ip_distinct_emails',
    });
    expect(t.reserve('8.8.8.8', 'a', 0).allowed).toBe(true);
    t.reset();
    expect(t.reserve('8.8.8.8', 'd', 0).allowed).toBe(true);
  });
});

describe('BoundedStore', () => {
  it('sweeps expired entries before evicting anything active', () => {
    const warn = vi.fn();
    const s = new BoundedStore<{ expiresAt: number }>(3, 't', warn);
    s.set('a', { expiresAt: 100 }, 0);
    s.set('b', { expiresAt: 10 }, 0);
    s.set('c', { expiresAt: 200 }, 0);
    s.set('d', { expiresAt: 300 }, 50);
    expect(s.get('b', 50)).toBeUndefined();
    expect(s.get('a', 50)).toBeDefined();
    expect(s.size).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });

  it('resumes the sweep cursor across calls and covers the whole map', () => {
    const s = new BoundedStore<{ expiresAt: number }>(4, 't');
    s.set('a', { expiresAt: 1_000 }, 0);
    s.set('b', { expiresAt: 1_000 }, 0);
    s.set('c', { expiresAt: 1_000 }, 0);
    s.set('z', { expiresAt: 5 }, 0); // expired entry sits at the end of the map
    s.set('e', { expiresAt: 1_000 }, 10);
    expect(s.size).toBe(4);
    expect(s.get('z', 10)).toBeUndefined();
    expect(s.get('a', 10)).toBeDefined();
  });

  it('evicts the active entry with the least time left and warns when full of lockouts', () => {
    const warn = vi.fn();
    const s = new BoundedStore<{ expiresAt: number }>(3, 'login-email', warn);
    s.set('long', { expiresAt: 900 }, 0);
    s.set('short', { expiresAt: 100 }, 0);
    s.set('mid', { expiresAt: 500 }, 0);
    s.set('new', { expiresAt: 1_000 }, 10);
    expect(s.get('short', 10)).toBeUndefined();
    expect(s.get('long', 10)).toBeDefined();
    expect(s.get('new', 10)).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('evicted'),
      expect.objectContaining({ store: 'login-email', remainingMs: 90 }),
    );
  });

  it('never blocks new keys when an attacker fills the store', () => {
    const t = createLoginThrottle(
      opts({
        maxEntries: 5,
        emailFreeFailures: 1,
        backoffBaseMs: 600_000,
        ipDistinctEmailsPerWindow: 1000,
        ipAttemptsPerWindow: 1000,
      }),
    );
    for (let i = 0; i < 50; i += 1) t.reserve('6.6.6.6', `junk${i}@x`, i);
    expect(t.reserve('7.7.7.7', 'real-user@x', 100).allowed).toBe(true);
  });
});

describe('ip window limiter', () => {
  it('allows `limit` hits per window per normalised IP', () => {
    const l = createIpWindowLimiter(2, 1_000);
    expect(l.hit('::ffff:1.2.3.4', 0).allowed).toBe(true);
    expect(l.hit('1.2.3.4', 0).allowed).toBe(true);
    expect(l.hit('1.2.3.4', 10)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(l.hit('1.2.3.4', 1_000).allowed).toBe(true);
    l.reset();
  });
});
