import type { PrismaClient } from '@finance-os/db';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerPrisma } from './plugins/prisma.js';
import { registerSecretGuard } from './plugins/secret-guard.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1.js';

export interface ServerDeps {
  prisma: PrismaClient;
  /** Session lifetime; defaults to 30 days. */
  sessionTtlMs?: number;
}

export async function buildServer(deps: ServerDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerPrisma(app, deps.prisma);
  registerErrorHandler(app);
  registerSecretGuard(app);
  registerAuth(app);
  await registerOpenApi(app);

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: '/v1', sessionTtlMs: deps.sessionTtlMs });

  return app;
}
