import { badRequest, containsSecretKey } from '@finance-os/shared';
import type { FastifyInstance } from 'fastify';

/** AGENTS.md rule 1: refuse any request body that contains a Stellar secret key. */
export function registerSecretGuard(app: FastifyInstance): void {
  app.addHook('preValidation', async (req) => {
    if (req.body !== undefined && containsSecretKey(req.body)) {
      throw badRequest('Secret keys must never be sent to the backend. Sign in your wallet.');
    }
  });
}
