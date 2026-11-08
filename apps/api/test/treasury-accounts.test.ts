import { Keypair } from '@stellar/stellar-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, orgWithAllRoles, startHarness, type Harness } from './harness.js';

describe('treasury account routes', () => {
  let h: Harness;
  let ctx: Awaited<ReturnType<typeof orgWithAllRoles>>;
  beforeAll(async () => {
    h = await startHarness();
    ctx = await orgWithAllRoles(h.app);
  });
  afterAll(() => h.close());

  const url = () => `/v1/orgs/${ctx.org.id}/treasury-accounts`;
  const create = (token: string, stellarAddress = Keypair.random().publicKey()) =>
    h.app.inject({
      method: 'POST',
      url: url(),
      headers: bearer(token),
      payload: { stellarAddress, label: 'Main USDC' },
    });

  it('registers an account on the server network', async () => {
    const res = await create(ctx.users.admin.token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      label: 'Main USDC',
      network: 'testnet',
      indexerCursor: null,
    });
  });

  it('rejects bad checksums, muxed and secret keys', async () => {
    const g = Keypair.random().publicKey();
    for (const stellarAddress of [
      g.slice(0, -1) + (g.endsWith('A') ? 'B' : 'A'),
      'M' + 'A'.repeat(68),
    ]) {
      const res = await create(ctx.users.owner.token, stellarAddress);
      expect(res.statusCode, stellarAddress).toBe(400);
    }
    const secret = await create(ctx.users.owner.token, Keypair.random().secret());
    expect(secret.statusCode).toBe(400);
    expect(secret.body).not.toMatch(/S[A-Z2-7]{55}/);
  });

  it('refuses to register the same address twice', async () => {
    const address = Keypair.random().publicKey();
    expect((await create(ctx.users.owner.token, address)).statusCode).toBe(201);
    expect((await create(ctx.users.owner.token, address)).statusCode).toBe(409);
  });

  it('only owners and admins manage accounts, everyone can read them', async () => {
    for (const role of ['approver', 'accountant', 'viewer'] as const) {
      expect((await create(ctx.users[role].token)).statusCode, role).toBe(403);
      const list = await h.app.inject({
        method: 'GET',
        url: url(),
        headers: bearer(ctx.users[role].token),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().items.length).toBeGreaterThan(0);
    }
  });

  it('renames and deletes an unreferenced account', async () => {
    const id = (await create(ctx.users.owner.token)).json().id;
    const renamed = await h.app.inject({
      method: 'PATCH',
      url: `${url()}/${id}`,
      headers: bearer(ctx.users.owner.token),
      payload: { label: 'Ops' },
    });
    expect(renamed.json().label).toBe('Ops');
    const del = await h.app.inject({
      method: 'DELETE',
      url: `${url()}/${id}`,
      headers: bearer(ctx.users.owner.token),
    });
    expect(del.statusCode).toBe(204);
    const get = await h.app.inject({
      method: 'GET',
      url: `${url()}/${id}`,
      headers: bearer(ctx.users.owner.token),
    });
    expect(get.statusCode).toBe(404);
  });
});
