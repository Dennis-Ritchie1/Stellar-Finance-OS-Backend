import { conflict, MemberRoleSchema, unauthorized } from '@finance-os/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../db-errors.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, revokeSession } from '../auth/session.js';
import { authOf, requireAuth } from '../plugins/auth.js';
import { bearerSecurity, DateTimeString, EmailSchema, errorResponses } from '../schemas/common.js';

const PasswordSchema = z.string().min(10).max(256);

const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  createdAt: DateTimeString,
});

const SessionResponse = z.object({
  user: UserSchema,
  token: z.string().describe('Send as `Authorization: Bearer <token>`'),
  expiresAt: DateTimeString,
});

const toUserDto = (u: { id: string; email: string; name: string | null; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt.toISOString(),
});

export interface AuthRoutesOptions {
  sessionTtlMs?: number;
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, opts) => {
  const issue = async (user: Parameters<typeof toUserDto>[0]) => {
    const { token, expiresAt } = await createSession(app.prisma, user.id, opts.sessionTtlMs);
    return { user: toUserDto(user), token, expiresAt: expiresAt.toISOString() };
  };

  app.post(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create an account and start a session',
        body: z.object({
          email: EmailSchema,
          password: PasswordSchema,
          name: z.string().trim().min(1).max(200).optional(),
        }),
        response: { 201: SessionResponse, ...errorResponses(400, 409) },
      },
    },
    async (req, reply) => {
      const { email, password, name } = req.body;
      const passwordHash = await hashPassword(password);
      const user = await app.prisma.user
        .create({ data: { email, name: name ?? null, passwordHash } })
        .catch((err: unknown) => {
          if (isUniqueViolation(err)) throw conflict('An account with this email already exists');
          throw err;
        });
      return reply.status(201).send(await issue(user));
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange email + password for a session token',
        body: z.object({ email: EmailSchema, password: z.string().min(1).max(256) }),
        response: { 200: SessionResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => {
      const { email, password } = req.body;
      const user = await app.prisma.user.findUnique({ where: { email } });
      const ok = await verifyPassword(user?.passwordHash ?? null, password);
      if (!user || !ok) throw unauthorized('Invalid email or password');
      return issue(user);
    },
  );

  app.post(
    '/auth/logout',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Revoke the current session',
        security: bearerSecurity,
        response: { 204: z.null().describe('Session revoked'), ...errorResponses(401) },
      },
    },
    async (req, reply) => {
      await revokeSession(app.prisma, authOf(req).sessionId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'The signed-in user and their organizations',
        security: bearerSecurity,
        response: {
          200: z.object({
            user: UserSchema,
            memberships: z.array(
              z.object({
                organizationId: z.uuid(),
                organizationName: z.string(),
                memberId: z.uuid(),
                role: MemberRoleSchema,
              }),
            ),
          }),
          ...errorResponses(401),
        },
      },
    },
    async (req) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: authOf(req).userId },
        include: { memberships: { include: { organization: { select: { name: true } } } } },
      });
      return {
        user: toUserDto(user),
        memberships: user.memberships.map((m) => ({
          organizationId: m.organizationId,
          organizationName: m.organization.name,
          memberId: m.id,
          role: m.role,
        })),
      };
    },
  );
};
