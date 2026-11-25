import type { Role } from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';

export interface UserWithMembership {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly organizationId: string;
  readonly role: Role;
}

export const findUserByEmail = async (
  db: Queryable,
  email: string,
): Promise<UserWithMembership | null> => {
  const { rows } = await db.query<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
    organization_id: string;
    role: Role;
  }>(
    `SELECT u.id, u.email, u.display_name, u.password_hash, m.organization_id, m.role
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE u.email = $1
      ORDER BY m.created_at ASC
      LIMIT 1`,
    [email],
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        passwordHash: r.password_hash,
        organizationId: r.organization_id,
        role: r.role,
      }
    : null;
};

export const emailExists = async (db: Queryable, email: string): Promise<boolean> => {
  const { rows } = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  return rows.length > 0;
};

export const insertOrganization = async (db: Queryable, name: string): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [name],
  );
  return (rows[0] as { id: string }).id;
};

export const insertUser = async (
  db: Queryable,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [input.email, input.displayName, input.passwordHash],
  );
  return (rows[0] as { id: string }).id;
};

export const insertMembership = async (
  db: Queryable,
  organizationId: string,
  userId: string,
  role: Role,
): Promise<void> => {
  await db.query('INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)', [
    organizationId,
    userId,
    role,
  ]);
};

export const touchLastLogin = async (db: Queryable, userId: string): Promise<void> => {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
};
