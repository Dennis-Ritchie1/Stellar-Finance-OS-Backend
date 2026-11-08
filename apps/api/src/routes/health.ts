import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const HealthResponse = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number(),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness check',
        response: { 200: HealthResponse },
      },
    },
    async () => ({ status: 'ok' as const, uptimeSeconds: Math.floor(process.uptime()) }),
  );
};
