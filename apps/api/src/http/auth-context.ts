import type { Permission, Role } from '@tickbook/shared';
import { hasPermission } from '@tickbook/shared';
import type { FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './errors.js';

export interface AuthContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
  readonly csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export const requireAuth = (request: FastifyRequest): AuthContext => {
  if (!request.auth) throw unauthorized();
  return request.auth;
};

/** RBAC guard: returns the auth context when the caller's role grants `permission`. */
export const requirePermission = (request: FastifyRequest, permission: Permission): AuthContext => {
  const auth = requireAuth(request);
  if (!hasPermission(auth.role, permission)) throw forbidden();
  return auth;
};
