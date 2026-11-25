import { BoundedStore, type WarnFn } from './bounded-store.js';
import { normalizeIp } from './client-ip.js';

/**
 * Login throttling (ADR-0013, threat model S-2/S-3). Three independent counters:
 *  - per email: progressive exponential backoff after a few failures (online guessing);
 *  - per normalised IP: attempts per window regardless of email (password spraying);
 *  - per normalised IP: distinct emails per window (caps key creation / enumeration).
 *
 * `reserve` is synchronous and counts the attempt before the caller awaits
 * anything, so parallel requests cannot all pass the check; a successful login
 * releases the email counter. State is in-process: it must move to Postgres
 * before running more than one API instance (TB-813).
 */
export interface LoginThrottleOptions {
  readonly ipAttemptsPerWindow: number;
  readonly ipDistinctEmailsPerWindow: number;
  readonly emailFreeFailures: number;
  readonly windowMs: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  /** How long an email's failure history is remembered without new attempts. */
  readonly emailDecayMs: number;
  readonly maxEntries: number;
  readonly warn?: WarnFn;
}

export const DEFAULT_THROTTLE: Omit<LoginThrottleOptions, 'ipAttemptsPerWindow'> = {
  ipDistinctEmailsPerWindow: 10,
  emailFreeFailures: 5,
  windowMs: 60_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 15 * 60_000,
  emailDecayMs: 15 * 60_000,
  maxEntries: 10_000,
};

interface IpEntry {
  readonly windowStart: number;
  readonly attempts: number;
  readonly emails: ReadonlySet<string>;
  readonly expiresAt: number;
}

interface EmailEntry {
  readonly failures: number;
  readonly lockedUntil: number;
  readonly expiresAt: number;
}

export type ThrottleDecision =
  | { readonly allowed: true; readonly succeeded: () => void }
  | {
      readonly allowed: false;
      readonly reason: 'ip_rate' | 'ip_distinct_emails' | 'email_backoff';
      readonly retryAfterSeconds: number;
    };

export const backoffMs = (failures: number, o: LoginThrottleOptions): number =>
  failures < o.emailFreeFailures
    ? 0
    : Math.min(o.backoffMaxMs, o.backoffBaseMs * 2 ** (failures - o.emailFreeFailures));

const seconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

export const createLoginThrottle = (options: LoginThrottleOptions) => {
  const ips = new BoundedStore<IpEntry>(options.maxEntries, 'login-ip', options.warn);
  const emails = new BoundedStore<EmailEntry>(options.maxEntries, 'login-email', options.warn);

  const reserve = (
    rawIp: string | undefined,
    email: string,
    now = Date.now(),
  ): ThrottleDecision => {
    const ipKey = normalizeIp(rawIp);
    const ip = ips.get(ipKey, now);
    const ipWindowEnd = ip ? ip.windowStart + options.windowMs : now + options.windowMs;

    if (ip && ip.attempts >= options.ipAttemptsPerWindow) {
      return { allowed: false, reason: 'ip_rate', retryAfterSeconds: seconds(ipWindowEnd - now) };
    }
    if (ip && !ip.emails.has(email) && ip.emails.size >= options.ipDistinctEmailsPerWindow) {
      return {
        allowed: false,
        reason: 'ip_distinct_emails',
        retryAfterSeconds: seconds(ipWindowEnd - now),
      };
    }
    const prior = emails.get(email, now);
    if (prior && prior.lockedUntil > now) {
      return {
        allowed: false,
        reason: 'email_backoff',
        retryAfterSeconds: seconds(prior.lockedUntil - now),
      };
    }

    // Reserve: count the attempt now, as a failure until proven otherwise.
    const windowStart = ip?.windowStart ?? now;
    ips.set(
      ipKey,
      {
        windowStart,
        attempts: (ip?.attempts ?? 0) + 1,
        emails: new Set([...(ip?.emails ?? []), email]),
        expiresAt: windowStart + options.windowMs,
      },
      now,
    );
    const failures = (prior?.failures ?? 0) + 1;
    const lockedUntil = now + backoffMs(failures, options);
    emails.set(
      email,
      { failures, lockedUntil, expiresAt: Math.max(lockedUntil, now + options.emailDecayMs) },
      now,
    );

    return { allowed: true, succeeded: () => emails.delete(email) };
  };

  return {
    reserve,
    reset: () => {
      ips.clear();
      emails.clear();
    },
  };
};

export type LoginThrottle = ReturnType<typeof createLoginThrottle>;

/** Fixed-window counter per normalised IP (used for registration). Synchronous. */
export const createIpWindowLimiter = (
  limit: number,
  windowMs: number,
  maxEntries = 10_000,
  warn?: WarnFn,
) => {
  const store = new BoundedStore<{ start: number; count: number; expiresAt: number }>(
    maxEntries,
    'ip-window',
    warn,
  );
  return {
    hit(
      rawIp: string | undefined,
      now = Date.now(),
    ): { allowed: boolean; retryAfterSeconds: number } {
      const key = normalizeIp(rawIp);
      const cur = store.get(key, now);
      if (cur && cur.count >= limit)
        return { allowed: false, retryAfterSeconds: seconds(cur.expiresAt - now) };
      const start = cur?.start ?? now;
      store.set(key, { start, count: (cur?.count ?? 0) + 1, expiresAt: start + windowMs }, now);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset: () => store.clear(),
  };
};
