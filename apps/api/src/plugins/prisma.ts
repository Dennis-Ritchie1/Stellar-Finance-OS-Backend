import type { PrismaClient } from '@finance-os/db';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/** Expose the Prisma client as `app.prisma`. The caller owns its lifecycle. */
export function registerPrisma(app: FastifyInstance, prisma: PrismaClient): void {
  app.decorate('prisma', prisma);
}
