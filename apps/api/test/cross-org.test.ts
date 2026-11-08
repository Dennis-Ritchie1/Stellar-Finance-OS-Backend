import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, orgWithAllRoles, startHarness, type Harness } from './harness.js';

/**
 * AGENTS.md rule 3: every org-scoped route must refuse callers from another
 * org — even owners — and must not touch the other org's data.
 */
describe('cross-org access', () => {
  let h: Harness;
  let a: Awaited<ReturnType<typeof orgWithAllRoles>>;
  let b: Awaited<ReturnType<typeof orgWithAllRoles>>;

  beforeAll(async () => {
    h = await startHarness();
    a = await orgWithAllRoles(h.app);
    b = await orgWithAllRoles(h.app);
  });
  afterAll(() => h.close());

  const routes = () =>
    [
      { method: 'GET', url: `/v1/orgs/${b.org.id}` },
      { method: 'PATCH', url: `/v1/orgs/${b.org.id}`, payload: { name: 'pwned' } },
      { method: 'GET', url: `/v1/orgs/${b.org.id}/members` },
      { method: 'GET', url: `/v1/orgs/${b.org.id}/members/${b.memberIds.viewer}` },
      {
        method: 'POST',
        url: `/v1/orgs/${b.org.id}/members`,
        payload: { email: a.users.viewer.email, role: 'owner' },
      },
      {
        method: 'PATCH',
        url: `/v1/orgs/${b.org.id}/members/${b.memberIds.viewer}`,
        payload: { role: 'admin' },
      },
      { method: 'DELETE', url: `/v1/orgs/${b.org.id}/members/${b.memberIds.viewer}` },
    ] as const;

  it('returns 404 to an owner of another org on every org route', async () => {
    for (const r of routes()) {
      const res = await h.app.inject({ ...r, headers: bearer(a.users.owner.token) });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(404);
    }
    const org = await h.db.prisma.organization.findUniqueOrThrow({ where: { id: b.org.id } });
    expect(org.name).not.toBe('pwned');
    expect(await h.db.prisma.member.count({ where: { organizationId: b.org.id } })).toBe(5);
  });

  it("cannot reach another org's member through its own org id", async () => {
    const own = `/v1/orgs/${a.org.id}/members/${b.memberIds.viewer}`;
    const token = bearer(a.users.owner.token);
    for (const res of await Promise.all([
      h.app.inject({ method: 'GET', url: own, headers: token }),
      h.app.inject({ method: 'PATCH', url: own, headers: token, payload: { role: 'admin' } }),
      h.app.inject({ method: 'DELETE', url: own, headers: token }),
    ])) {
      expect(res.statusCode).toBe(404);
    }
    const target = await h.db.prisma.member.findUniqueOrThrow({
      where: { id: b.memberIds.viewer },
    });
    expect(target.role).toBe('viewer');
  });

  it('returns 401 without a session', async () => {
    for (const r of routes()) {
      const res = await h.app.inject({ ...r });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
  });
});
