import type { LoginInput, RegisterInput } from '@tickbook/shared';
import { withTransaction, type Pool } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../security/password.js';
import { hashToken, randomToken } from '../../security/tokens.js';
import { writeAudit } from '../audit/audit.repository.js';
import { createAccount } from '../accounts/accounts.repository.js';
import { createSession } from './session.repository.js';
import {
  findUserByEmail,
  insertMembership,
  insertOrganization,
  insertUser,
  touchLastLogin,
} from './user.repository.js';

/** Simulated starting balance for a new firm's first paper-trading account: 1,000,000.00. */
export const STARTING_CASH_MINOR = 100_000_000;

export interface SessionGrant {
  readonly token: string;
  readonly csrfToken: string;
  readonly userId: string;
  readonly organizationId: string;
}

interface SessionSettings {
  readonly secret: string;
  readonly ttlHours: number;
}

interface ClientInfo {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}

const issueSession = async (
  pool: Pool,
  userId: string,
  organizationId: string,
  settings: SessionSettings,
  client: ClientInfo,
): Promise<SessionGrant> => {
  const token = randomToken();
  const csrfToken = randomToken();
  await createSession(pool, {
    tokenHash: hashToken(token, settings.secret),
    userId,
    organizationId,
    csrfToken,
    ttlHours: settings.ttlHours,
    ip: client.ip,
    userAgent: client.userAgent,
  });
  return { token, csrfToken, userId, organizationId };
};

/**
 * Registers a participant firm with its owner user and a funded paper-trading
 * account. Deliberately reveals nothing about whether the email already exists:
 * both paths hash a password (equal timing) and return the same result, and no
 * session is issued; the caller signs in afterwards. Email-verified signup via
 * the local outbox is planned (TB-812).
 */
export const register = async (
  pool: Pool,
  input: RegisterInput,
  client: ClientInfo,
): Promise<void> => {
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByEmail(pool, input.email);
  if (existing) {
    await writeAudit(pool, {
      organizationId: existing.organizationId,
      actorUserId: null,
      action: 'organization.register_duplicate_email',
      entityType: 'user',
      entityId: existing.id,
      requestId: client.requestId,
    });
    return;
  }
  try {
    await withTransaction(pool, async (tx) => {
      const orgId = await insertOrganization(tx, input.organizationName);
      const uid = await insertUser(tx, {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      });
      await insertMembership(tx, orgId, uid, 'owner');
      const accountId = await createAccount(tx, {
        organizationId: orgId,
        name: 'Primary',
        cashMinor: STARTING_CASH_MINOR,
      });
      await writeAudit(tx, {
        organizationId: orgId,
        actorUserId: uid,
        action: 'organization.registered',
        entityType: 'organization',
        entityId: orgId,
        metadata: { accountId },
        requestId: client.requestId,
      });
    });
  } catch (error) {
    // A concurrent registration of the same email loses the unique-index race; stay silent.
    if ((error as { code?: string }).code !== '23505') throw error;
  }
};

export const login = async (
  pool: Pool,
  input: LoginInput,
  settings: SessionSettings,
  client: ClientInfo,
): Promise<SessionGrant> => {
  const user = await findUserByEmail(pool, input.email);
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    await writeAudit(pool, {
      organizationId: user?.organizationId ?? null,
      actorUserId: user?.id ?? null,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      requestId: client.requestId,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  await touchLastLogin(pool, user.id);
  await writeAudit(pool, {
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    requestId: client.requestId,
  });
  return issueSession(pool, user.id, user.organizationId, settings, client);
};
