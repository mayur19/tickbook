import type { FastifyError, FastifyInstance } from 'fastify';
import { fail } from './envelope.js';
import { AppError } from './errors.js';

/** Central error mapping: every failure leaves as the standard JSON envelope. */
export const registerErrorHandling = (app: FastifyInstance): void => {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500 && error.statusCode !== 501) request.log.error({ err: error });
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
    }
    const status = error.statusCode ?? 500;
    if (status === 400 && error.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.status(400).send(fail('INVALID_JSON', 'Request body is not valid JSON'));
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send(fail(error.code ?? 'BAD_REQUEST', error.message));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(fail('INTERNAL', 'An unexpected error occurred'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(fail('NOT_FOUND', `Route ${request.method} ${request.url} not found`)),
  );
};
