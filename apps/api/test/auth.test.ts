import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/session.js';
import { bearer, PASSWORD, registerUser, startHarness, type Harness } from './harness.js';

describe('auth routes', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  it('registers a user, normalising the email, and returns a working session', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: '  New.User@Example.TEST ', password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('new.user@example.test');
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body).not.toContain('passwordHash');

    const me = await h.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: bearer(body.token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: body.user.id }, memberships: [] });
  });

  it('stores only an argon2 hash of the password and a SHA-256 of the token', async () => {
    const u = await registerUser(h.app);
    const user = await h.db.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const sessions = await h.db.prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBe(hashToken(u.token));
    expect(sessions[0]!.tokenHash).not.toBe(u.token);
  });

  it('rejects a duplicate email with 409', async () => {
    const u = await registerUser(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: u.email.toUpperCase(), password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects short passwords and malformed emails', async () => {
    for (const payload of [
      { email: 'a@b.test', password: 'short' },
      { email: 'not-an-email', password: PASSWORD },
    ]) {
      const res = await h.app.inject({ method: 'POST', url: '/v1/auth/register', payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it('logs in with the right password and refuses the wrong one identically to an unknown email', async () => {
    const u = await registerUser(h.app);
    const ok = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: u.email, password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).not.toBe(u.token);

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: u.email, password: 'wrong-password-123' },
    });
    const unknown = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'nobody@test.dev', password: 'wrong-password-123' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('matches emails case-insensitively on login', async () => {
    const u = await registerUser(h.app, 'MixedCase@test.dev');
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'MIXEDCASE@TEST.DEV', password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(u.id);
  });

  it('logout revokes only the current session', async () => {
    const u = await registerUser(h.app);
    const second = (
      await h.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: u.email, password: PASSWORD },
      })
    ).json().token as string;

    const out = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: bearer(u.token),
    });
    expect(out.statusCode).toBe(204);

    const revoked = await h.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: bearer(u.token),
    });
    expect(revoked.statusCode).toBe(401);
    const still = await h.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: bearer(second),
    });
    expect(still.statusCode).toBe(200);
  });

  it('rejects expired sessions', async () => {
    const u = await registerUser(h.app);
    await h.db.prisma.session.updateMany({
      where: { tokenHash: hashToken(u.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await h.app.inject({ method: 'GET', url: '/v1/auth/me', headers: bearer(u.token) });
    expect(res.statusCode).toBe(401);
  });

  it('requires a bearer token on protected routes', async () => {
    for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'Basic abc' }]) {
      const res = await h.app.inject({ method: 'GET', url: '/v1/auth/me', headers });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
  });
});
