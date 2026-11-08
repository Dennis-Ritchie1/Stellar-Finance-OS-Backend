import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createOrg,
  orgWithAllRoles,
  registerUser,
  startHarness,
  type Harness,
} from './harness.js';

describe('organization routes', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  it('creates an org and makes the creator its owner', async () => {
    const u = await registerUser(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: bearer(u.token),
      payload: { name: 'Acme Ltd', slug: 'acme-ltd' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Acme Ltd', slug: 'acme-ltd', role: 'owner' });

    const member = await h.db.prisma.member.findFirstOrThrow({
      where: { organizationId: res.json().id, userId: u.id },
    });
    expect(member.role).toBe('owner');
  });

  it('rejects a taken slug with 409 and a malformed one with 400', async () => {
    const u = await registerUser(h.app);
    const org = await createOrg(h.app, u);
    const taken = await h.app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: bearer(u.token),
      payload: { name: 'Again', slug: org.slug },
    });
    expect(taken.statusCode).toBe(409);
    const bad = await h.app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: bearer(u.token),
      payload: { name: 'Bad', slug: 'Not A Slug' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('lists only the orgs the caller belongs to, with their role in each', async () => {
    const a = await registerUser(h.app);
    const b = await registerUser(h.app);
    const orgA = await createOrg(h.app, a);
    await createOrg(h.app, b);

    const res = await h.app.inject({ method: 'GET', url: '/v1/orgs', headers: bearer(a.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([expect.objectContaining({ id: orgA.id, role: 'owner' })]);
  });

  it('lets any member read the org but only owners/admins update it', async () => {
    const { org, users } = await orgWithAllRoles(h.app);
    for (const role of ['owner', 'admin', 'approver', 'accountant', 'viewer'] as const) {
      const get = await h.app.inject({
        method: 'GET',
        url: `/v1/orgs/${org.id}`,
        headers: bearer(users[role].token),
      });
      expect(get.statusCode, role).toBe(200);
      expect(get.json().role).toBe(role);

      const patch = await h.app.inject({
        method: 'PATCH',
        url: `/v1/orgs/${org.id}`,
        headers: bearer(users[role].token),
        payload: { name: `Renamed by ${role}` },
      });
      expect(patch.statusCode, role).toBe(role === 'owner' || role === 'admin' ? 200 : 403);
    }
  });

  it('rejects an empty update', async () => {
    const u = await registerUser(h.app);
    const org = await createOrg(h.app, u);
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/orgs/${org.id}`,
      headers: bearer(u.token),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('answers 404 for a nonexistent org and for an org the caller is not in', async () => {
    const u = await registerUser(h.app);
    const other = await createOrg(h.app, await registerUser(h.app));
    const missing = await h.app.inject({
      method: 'GET',
      url: '/v1/orgs/00000000-0000-7000-8000-000000000000',
      headers: bearer(u.token),
    });
    const foreign = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${other.id}`,
      headers: bearer(u.token),
    });
    expect(missing.statusCode).toBe(404);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
  });
});
