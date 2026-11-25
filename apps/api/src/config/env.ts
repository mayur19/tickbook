import { isIP } from 'node:net';
import { z } from 'zod';

export type TrustProxy = false | number | string[];

const CIDR = /^([0-9a-fA-F:.]+)(\/\d{1,3})?$/;

/**
 * TRUST_PROXY: unset/"false" (default, trust nothing), a hop count ("1"), or a
 * comma-separated list of proxy IPs/CIDRs ("127.0.0.1,10.0.0.0/8"). "true" is
 * rejected on purpose: trusting every X-Forwarded-For hop lets clients spoof
 * their IP and bypass login throttling.
 */
export const parseTrustProxy = (raw: string | undefined): TrustProxy => {
  const value = (raw ?? '').trim();
  if (value === '' || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const valid = parts.every((p) => {
    const m = CIDR.exec(p);
    return m !== null && isIP(m[1] as string) !== 0;
  });
  if (!valid || parts.length === 0) {
    throw new Error(
      'TRUST_PROXY must be "false", a hop count, or a comma-separated list of IPs/CIDRs',
    );
  }
  return parts;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4106),
  APP_ORIGIN: z.string().url().default('http://localhost:5106'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(12),
  /** Login attempts per normalised client IP per minute, across all emails. */
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(30),
  REGISTER_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(5),
  TRUST_PROXY: z.string().optional(),
  DEPTH_PUBLISH_LEVELS: z.coerce.number().int().min(1).max(100).default(20),
});

export type AppConfig = Omit<z.infer<typeof envSchema>, 'TRUST_PROXY'> & {
  readonly isProduction: boolean;
  readonly trustProxy: TrustProxy;
};

/** Parses and validates process configuration; throws with every problem listed. */
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const { TRUST_PROXY, ...rest } = parsed.data;
  const isProduction = rest.NODE_ENV === 'production';
  if (isProduction && TRUST_PROXY === undefined) {
    throw new Error(
      'Invalid configuration: TRUST_PROXY must be set explicitly in production ("false", a hop count, or proxy IPs/CIDRs)',
    );
  }
  return { ...rest, isProduction, trustProxy: parseTrustProxy(TRUST_PROXY) };
};
