import { isAppError } from '@finance-os/shared';
import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** Maps AppError / validation errors to a stable JSON error shape. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: err.validation,
        },
      });
    }
    if (isAppError(err)) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
}
