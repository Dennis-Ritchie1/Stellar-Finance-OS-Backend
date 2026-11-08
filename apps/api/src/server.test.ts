import { createPrismaClient } from '@finance-os/db';
import { notFound } from '@finance-os/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testStellarContext } from '../test/fake-stellar.js';
import { buildServer } from './server.js';

describe('api server', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    // These routes never touch the DB; the client connects lazily and never will.
    app = await buildServer({
      prisma: createPrismaClient('postgresql://unused@127.0.0.1:1/unused'),
      stellar: testStellarContext(),
    });
    app.get('/boom', async () => {
      throw notFound('Invoice');
    });
    app.post('/echo', async (req) => req.body);
    await app.ready();
  });

  afterAll(() => app.close());

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('serves an OpenAPI 3 document at /openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths['/health']).toBeDefined();
  });

  it('maps AppError to its status and code', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  });

  it('rejects bodies containing a Stellar secret key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: { signer: 'S' + 'A'.repeat(55) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('SAAAA');
  });
});
