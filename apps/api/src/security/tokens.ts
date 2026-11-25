import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Session tokens are stored only as keyed hashes so a database leak cannot replay sessions. */
export const hashToken = (token: string, secret: string): string =>
  createHmac('sha256', secret).update(token).digest('hex');

export const safeEqual = (a: string, b: string): boolean => {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
};
