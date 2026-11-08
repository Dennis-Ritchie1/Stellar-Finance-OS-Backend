import type { MemberRole } from '@finance-os/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  bearer,
  createOrg,
  orgWithAllRoles,
  registerUser,
  startHarness,
  type Harness,
} from './harness.js';

describe('member routes', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  const patchRole = (orgId: string, token: string, memberId: string, role: MemberRole) =>
    h.app.inject({
      method: 'PATCH',
      url: `/v1/orgs/${orgId}/members/${memberId}`,
      headers: bearer(token),
      payload: { role },
    });
  const remove = (orgId: string, token: string, memberId: string) =>
    h.app.inject({
      method: 'DELETE',
      url: `/v1/orgs/${orgId}/members/${memberId}`,
      headers: bearer(token),
    });

  it('lists members with their user details to every role', async () => {
    const { org, users } = await orgWithAllRoles(h.app);
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${org.id}/members`,
      headers: bearer(users.viewer.token),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ email: string; role: string }>;
    expect(items.map((m) => m.role).sort()).toEqual([
      'accountant',
      'admin',
      'approver',
      'owner',
      'viewer',
    ]);
    expect(items.find((m) => m.role === 'viewer')?.email).toBe(users.viewer.email);
  });

  it('gets a single member', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${org.id}/members/${memberIds.accountant}`,
      headers: bearer(users.approver.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: memberIds.accountant, role: 'accountant' });
  });

  it('only owners and admins can add, change or remove members', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    for (const role of ['approver', 'accountant', 'viewer'] as const) {
      const newcomer = await registerUser(h.app);
      const add = await h.app.inject({
        method: 'POST',
        url: `/v1/orgs/${org.id}/members`,
        headers: bearer(users[role].token),
        payload: { email: newcomer.email, role: 'viewer' },
      });
      expect(add.statusCode, role).toBe(403);
      expect(
        (await patchRole(org.id, users[role].token, memberIds.viewer, 'admin')).statusCode,
      ).toBe(403);
      expect((await remove(org.id, users[role].token, memberIds.viewer)).statusCode).toBe(403);
    }
  });

  it('lets an admin manage non-owner members', async () => {
    const { org, users } = await orgWithAllRoles(h.app);
    const newcomer = await registerUser(h.app);
    const id = await addMember(h.app, org.id, users.admin, newcomer, 'viewer');

    const promoted = await patchRole(org.id, users.admin.token, id, 'accountant');
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json().role).toBe('accountant');

    expect((await remove(org.id, users.admin.token, id)).statusCode).toBe(204);
    const gone = await h.db.prisma.member.findUnique({ where: { id } });
    expect(gone).toBeNull();
  });

  it('stops admins from creating, changing or removing owners', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    const newcomer = await registerUser(h.app);
    const add = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${org.id}/members`,
      headers: bearer(users.admin.token),
      payload: { email: newcomer.email, role: 'owner' },
    });
    expect(add.statusCode).toBe(403);
    expect((await patchRole(org.id, users.admin.token, memberIds.viewer, 'owner')).statusCode).toBe(
      403,
    );
    expect((await patchRole(org.id, users.admin.token, memberIds.owner, 'viewer')).statusCode).toBe(
      403,
    );
    expect((await remove(org.id, users.admin.token, memberIds.owner)).statusCode).toBe(403);
  });

  it('never leaves an org without an owner', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    const demote = await patchRole(org.id, users.owner.token, memberIds.owner, 'admin');
    expect(demote.statusCode).toBe(409);
    expect((await remove(org.id, users.owner.token, memberIds.owner)).statusCode).toBe(409);

    // With a second owner, the first may step down.
    expect((await patchRole(org.id, users.owner.token, memberIds.admin, 'owner')).statusCode).toBe(
      200,
    );
    expect((await patchRole(org.id, users.owner.token, memberIds.owner, 'admin')).statusCode).toBe(
      200,
    );
  });

  it('serialises concurrent owner demotions so one owner always remains', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    await patchRole(org.id, users.owner.token, memberIds.admin, 'owner');
    // Each owner steps down at once; neither change affects the other's own permissions.
    const results = await Promise.all([
      patchRole(org.id, users.owner.token, memberIds.owner, 'viewer'),
      patchRole(org.id, users.admin.token, memberIds.admin, 'viewer'),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const owners = await h.db.prisma.member.count({
      where: { organizationId: org.id, role: 'owner' },
    });
    expect(owners).toBe(1);
  });

  it('returns 404 for an unknown user and 409 for an existing member', async () => {
    const { org, users } = await orgWithAllRoles(h.app);
    const unknown = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${org.id}/members`,
      headers: bearer(users.owner.token),
      payload: { email: 'ghost@test.dev', role: 'viewer' },
    });
    expect(unknown.statusCode).toBe(404);
    const dup = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${org.id}/members`,
      headers: bearer(users.owner.token),
      payload: { email: users.viewer.email, role: 'viewer' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('refuses to delete a member with history, suggesting a role change instead', async () => {
    const { org, users, memberIds } = await orgWithAllRoles(h.app);
    await h.db.prisma.export.create({
      data: {
        organizationId: org.id,
        requestedByMemberId: memberIds.accountant,
        from: new Date('2026-01-01'),
        to: new Date('2026-02-01'),
      },
    });
    const res = await remove(org.id, users.owner.token, memberIds.accountant);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/viewer/);
  });

  it('a revoked member loses access immediately', async () => {
    const owner = await registerUser(h.app);
    const org = await createOrg(h.app, owner);
    const u = await registerUser(h.app);
    const id = await addMember(h.app, org.id, owner, u, 'viewer');
    const before = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${org.id}`,
      headers: bearer(u.token),
    });
    expect(before.statusCode).toBe(200);
    await remove(org.id, owner.token, id);
    const after = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${org.id}`,
      headers: bearer(u.token),
    });
    expect(after.statusCode).toBe(404);
  });
});
