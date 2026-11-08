import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * All business routes live under /v1 (README §8).
 * Route modules (auth, orgs, invoices, …) are registered here as they land.
 */
export const v1Routes: FastifyPluginAsyncZod = async (_app) => {};
