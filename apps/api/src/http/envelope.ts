import type { Envelope } from '@tickbook/shared';

export const ok = <T>(data: T, meta?: Record<string, unknown>): Envelope<T> =>
  meta === undefined ? { data, error: null } : { data, error: null, meta };

export const fail = (code: string, message: string, details?: unknown): Envelope<never> => ({
  data: null,
  error: details === undefined ? { code, message } : { code, message, details },
});
