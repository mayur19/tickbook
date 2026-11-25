import { isIPv4, isIPv6 } from 'node:net';

const expandIpv6 = (ip: string): string[] => {
  const [head = '', tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const missing = ip.includes('::') ? 8 - h.length - t.length : 0;
  return [...h, ...Array<string>(missing).fill('0'), ...t].map((g) =>
    g.toLowerCase().padStart(4, '0'),
  );
};

/**
 * Normalises a client address into a throttling key: IPv4-mapped IPv6 becomes
 * plain IPv4, and any other IPv6 address collapses to its /64 prefix (one
 * subscriber typically controls a whole /64, so per-address keys are useless).
 */
export const normalizeIp = (raw: string | undefined | null): string => {
  if (!raw) return 'unknown';
  const ip = raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0] as string;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1] as string;
  if (isIPv4(ip)) return ip;
  if (isIPv6(ip)) return `${expandIpv6(ip).slice(0, 4).join(':')}::/64`;
  return 'unknown';
};
