import type { Envelope } from '@tickbook/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const readCookie = (name: string): string | null => {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

/** Fetch wrapper: same-origin cookies, CSRF header on mutations, envelope unwrapping. */
export const api = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCookie('tb_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  const envelope = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !envelope || envelope.error) {
    const err = envelope?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'NETWORK',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return envelope.data as T;
};
