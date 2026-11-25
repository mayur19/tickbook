import { loginSchema, registerSchema, ROLE_PERMISSIONS } from '@tickbook/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../../app.js';
import { requireAuth } from '../../http/auth-context.js';
import { ok } from '../../http/envelope.js';
import { AppError } from '../../http/errors.js';
import {
  createIpWindowLimiter,
  createLoginThrottle,
  DEFAULT_THROTTLE,
} from '../../http/login-throttle.js';
import { parse } from '../../http/validate.js';
import { writeAudit } from '../audit/audit.repository.js';
import { login, register, type SessionGrant } from './auth.service.js';
import { deleteSession } from './session.repository.js';

export const SESSION_COOKIE = 'tb_session';
export const CSRF_COOKIE = 'tb_csrf';

export const registerAuthRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  const { pool, config } = deps;
  const settings = { secret: config.SESSION_SECRET, ttlHours: config.SESSION_TTL_HOURS };
  const warn = (message: string, context: Record<string, unknown>) =>
    app.log.warn(context, message);
  const throttle =
    deps.loginThrottle ??
    createLoginThrottle({
      ...DEFAULT_THROTTLE,
      ipAttemptsPerWindow: config.LOGIN_RATE_LIMIT_PER_MINUTE,
      warn,
    });
  const registerLimiter = createIpWindowLimiter(
    config.REGISTER_RATE_LIMIT_PER_HOUR,
    3_600_000,
    10_000,
    warn,
  );
  const tooMany = (reply: FastifyReply, retryAfterSeconds: number, message: string) => {
    reply.header('retry-after', String(retryAfterSeconds));
    return new AppError(429, 'RATE_LIMITED', message, { retryAfterSeconds });
  };
  const clientOf = (req: FastifyRequest) => ({
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    requestId: req.id,
  });

  const setCookies = (reply: FastifyReply, grant: SessionGrant): void => {
    const base = {
      path: '/',
      sameSite: 'lax' as const,
      secure: config.isProduction,
      maxAge: settings.ttlHours * 3600,
    };
    reply.setCookie(SESSION_COOKIE, grant.token, { ...base, httpOnly: true });
    reply.setCookie(CSRF_COOKIE, grant.csrfToken, { ...base, httpOnly: false });
  };

  app.post('/api/v1/auth/register', async (req, reply) => {
    const limit = registerLimiter.hit(req.ip);
    if (!limit.allowed)
      throw tooMany(reply, limit.retryAfterSeconds, 'Too many registrations; try again later');
    const input = parse(registerSchema, req.body);
    await register(pool, input, clientOf(req));
    return reply.status(202).send(
      ok({
        message:
          'If the details are valid, the organization is ready. Sign in with your email and password.',
      }),
    );
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    const input = parse(loginSchema, req.body);
    // Reserved synchronously, before any await, so concurrent attempts are all counted.
    const decision = throttle.reserve(req.ip, input.email);
    if (!decision.allowed) {
      throw tooMany(reply, decision.retryAfterSeconds, 'Too many login attempts; try again later');
    }
    const grant = await login(pool, input, settings, clientOf(req));
    decision.succeeded();
    setCookies(reply, grant);
    return ok({
      userId: grant.userId,
      organizationId: grant.organizationId,
      csrfToken: grant.csrfToken,
    });
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const auth = requireAuth(req);
    await deleteSession(pool, auth.sessionId);
    await writeAudit(pool, {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: auth.sessionId,
      requestId: req.id,
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/v1/auth/me', async (req) => {
    const auth = requireAuth(req);
    return ok({
      user: { id: auth.userId, email: auth.email, displayName: auth.displayName },
      organization: { id: auth.organizationId, name: auth.organizationName },
      role: auth.role,
      permissions: ROLE_PERMISSIONS[auth.role],
      csrfToken: auth.csrfToken,
    });
  });
};
