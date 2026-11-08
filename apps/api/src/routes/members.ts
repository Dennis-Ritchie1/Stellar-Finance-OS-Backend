import type { Prisma } from '@finance-os/db';
import {
  conflict,
  MemberRoleSchema,
  notFound,
  OrgParamsSchema,
  OrgResourceParamsSchema,
} from '@finance-os/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isForeignKeyViolation, isUniqueViolation } from '../db-errors.js';
import { membershipOf, requireOrgPermission } from '../plugins/auth.js';
import { assertMemberChangeAllowed } from '../rbac/member-rules.js';
import { bearerSecurity, DateTimeString, EmailSchema, errorResponses } from '../schemas/common.js';

const MemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  role: MemberRoleSchema,
  createdAt: DateTimeString,
});

const memberInclude = { user: { select: { email: true, name: true } } } as const;
type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

const toMemberDto = (m: MemberRow) => ({
  id: m.id,
  userId: m.userId,
  email: m.user.email,
  name: m.user.name,
  role: m.role,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Lock the org's owner rows and return how many there are, so two concurrent
 * demotions can't both see "2 owners" and leave the org with none.
 */
async function lockOwnerCount(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "members"
    WHERE "organizationId" = ${organizationId}::uuid AND "role" = 'owner'
    FOR UPDATE`;
  return rows.length;
}

export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/orgs/:orgId/members',
    {
      preHandler: requireOrgPermission('members:read'),
      schema: {
        tags: ['members'],
        summary: 'List members',
        security: bearerSecurity,
        params: OrgParamsSchema,
        response: { 200: z.object({ items: z.array(MemberSchema) }), ...errorResponses(401, 404) },
      },
    },
    async (req) => {
      const { organizationId } = membershipOf(req);
      const members = await app.prisma.member.findMany({
        where: { organizationId },
        include: memberInclude,
        orderBy: { createdAt: 'asc' },
      });
      return { items: members.map(toMemberDto) };
    },
  );

  app.get(
    '/orgs/:orgId/members/:id',
    {
      preHandler: requireOrgPermission('members:read'),
      schema: {
        tags: ['members'],
        summary: 'Get a member',
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        response: { 200: MemberSchema, ...errorResponses(401, 404) },
      },
    },
    async (req) => {
      const { organizationId } = membershipOf(req);
      const member = await app.prisma.member.findFirst({
        where: { id: req.params.id, organizationId },
        include: memberInclude,
      });
      if (!member) throw notFound('Member');
      return toMemberDto(member);
    },
  );

  app.post(
    '/orgs/:orgId/members',
    {
      preHandler: requireOrgPermission('members:manage'),
      schema: {
        tags: ['members'],
        summary: 'Add a registered user to the organization',
        security: bearerSecurity,
        params: OrgParamsSchema,
        body: z.object({ email: EmailSchema, role: MemberRoleSchema }),
        response: { 201: MemberSchema, ...errorResponses(400, 401, 403, 404, 409) },
      },
    },
    async (req, reply) => {
      const { organizationId, role: actorRole } = membershipOf(req);
      const { email, role } = req.body;
      assertMemberChangeAllowed({ actorRole, from: null, to: role, ownerCount: 0 });

      const user = await app.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) throw notFound('User');
      const member = await app.prisma.member
        .create({ data: { organizationId, userId: user.id, role }, include: memberInclude })
        .catch((err: unknown) => {
          if (isUniqueViolation(err)) throw conflict('That user is already a member');
          throw err;
        });
      return reply.status(201).send(toMemberDto(member));
    },
  );

  app.patch(
    '/orgs/:orgId/members/:id',
    {
      preHandler: requireOrgPermission('members:manage'),
      schema: {
        tags: ['members'],
        summary: "Change a member's role",
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        body: z.object({ role: MemberRoleSchema }),
        response: { 200: MemberSchema, ...errorResponses(400, 401, 403, 404, 409) },
      },
    },
    async (req) => {
      const { organizationId, role: actorRole } = membershipOf(req);
      const member = await app.prisma.$transaction(async (tx) => {
        const ownerCount = await lockOwnerCount(tx, organizationId);
        const target = await tx.member.findFirst({
          where: { id: req.params.id, organizationId },
          select: { id: true, role: true },
        });
        if (!target) throw notFound('Member');
        assertMemberChangeAllowed({ actorRole, from: target.role, to: req.body.role, ownerCount });
        return tx.member.update({
          where: { id: target.id },
          data: { role: req.body.role },
          include: memberInclude,
        });
      });
      return toMemberDto(member);
    },
  );

  app.delete(
    '/orgs/:orgId/members/:id',
    {
      preHandler: requireOrgPermission('members:manage'),
      schema: {
        tags: ['members'],
        summary: 'Remove a member',
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        response: { 204: z.null().describe('Member removed'), ...errorResponses(401, 403, 404, 409) },
      },
    },
    async (req, reply) => {
      const { organizationId, role: actorRole } = membershipOf(req);
      await app.prisma
        .$transaction(async (tx) => {
          const ownerCount = await lockOwnerCount(tx, organizationId);
          const target = await tx.member.findFirst({
            where: { id: req.params.id, organizationId },
            select: { id: true, role: true },
          });
          if (!target) throw notFound('Member');
          assertMemberChangeAllowed({ actorRole, from: target.role, to: null, ownerCount });
          await tx.member.delete({ where: { id: target.id } });
        })
        .catch((err: unknown) => {
          if (isForeignKeyViolation(err)) {
            throw conflict(
              'This member has payment requests, approvals or exports on record; change their role to viewer instead',
            );
          }
          throw err;
        });
      return reply.status(204).send(null);
    },
  );
};
