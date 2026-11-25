import type { Role } from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';
import type { AuthContext } from '../../http/auth-context.js';

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  organization_id: string;
  organization_name: string;
  role: Role;
  csrf_token: string;
}

export const createSession = async (
  db: Queryable,
  input: {
    tokenHash: string;
    userId: string;
    organizationId: string;
    csrfToken: string;
    ttlHours: number;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sessions (token_hash, user_id, organization_id, csrf_token, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
     RETURNING id`,
    [
      input.tokenHash,
      input.userId,
      input.organizationId,
      input.csrfToken,
      input.ip,
      input.userAgent,
      input.ttlHours,
    ],
  );
  return (rows[0] as { id: string }).id;
};

export const findSession = async (
  db: Queryable,
  tokenHash: string,
): Promise<AuthContext | null> => {
  const { rows } = await db.query<SessionRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name,
            o.id AS organization_id, o.name AS organization_name, m.role, s.csrf_token
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = s.organization_id
       JOIN memberships m ON m.user_id = u.id AND m.organization_id = o.id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    csrfToken: row.csrf_token,
  };
};

export const deleteSession = async (db: Queryable, sessionId: string): Promise<void> => {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
};
