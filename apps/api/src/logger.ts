import type { FastifyServerOptions } from 'fastify';

/**
 * Pino options. Redacts anything that could carry credentials — and we never
 * accept Stellar secret keys anyway (AGENTS.md rule 1).
 */
export function loggerOptions(level: string, pretty: boolean): FastifyServerOptions['logger'] {
  return {
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  };
}
