import { conflict, MemberRoleSchema, OrgParamsSchema } from '@finance-os/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../db-errors.js';
import { authOf, membershipOf, requireAuth, requireOrgPermission } from '../plugins/auth.js';
import { bearerSecurity, DateTimeString, errorResponses } from '../schemas/common.js';

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, 'Lowercase letters, digits and hyphens (3–50)');

const OrgSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: MemberRoleSchema.describe("The caller's role in this organization"),
  createdAt: DateTimeString,
});

type OrgRow = { id: string; name: string; slug: string; createdAt: Date };
const toOrgDto = (o: OrgRow, role: z.infer<typeof MemberRoleSchema>) => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  role,
  createdAt: o.createdAt.toISOString(),
});

const slugTaken = (err: unknown) => {
  if (isUniqueViolation(err)) throw conflict('That slug is already taken');
  throw err;
};

export const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/orgs',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['orgs'],
        summary: 'Create an organization; the caller becomes its owner',
        security: bearerSecurity,
        body: z.object({ name: z.string().trim().min(1).max(200), slug: SlugSchema }),
        response: { 201: OrgSchema, ...errorResponses(400, 401, 409) },
      },
    },
    async (req, reply) => {
      const { userId } = authOf(req);
      const org = await app.prisma.organization
        .create({ data: { ...req.body, members: { create: { userId, role: 'owner' } } } })
        .catch(slugTaken);
      return reply.status(201).send(toOrgDto(org, 'owner'));
    },
  );

  app.get(
    '/orgs',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['orgs'],
        summary: 'Organizations the caller belongs to',
        security: bearerSecurity,
        response: { 200: z.object({ items: z.array(OrgSchema) }), ...errorResponses(401) },
      },
    },
    async (req) => {
      const memberships = await app.prisma.member.findMany({
        where: { userId: authOf(req).userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      });
      return { items: memberships.map((m) => toOrgDto(m.organization, m.role)) };
    },
  );

  app.get(
    '/orgs/:orgId',
    {
      preHandler: requireOrgPermission('org:read'),
      schema: {
        tags: ['orgs'],
        summary: 'Get an organization',
        security: bearerSecurity,
        params: OrgParamsSchema,
        response: { 200: OrgSchema, ...errorResponses(401, 404) },
      },
    },
    async (req) => {
      const { organizationId, role } = membershipOf(req);
      const org = await app.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      return toOrgDto(org, role);
    },
  );

  app.patch(
    '/orgs/:orgId',
    {
      preHandler: requireOrgPermission('org:update'),
      schema: {
        tags: ['orgs'],
        summary: 'Rename an organization or change its slug',
        security: bearerSecurity,
        params: OrgParamsSchema,
        body: z
          .object({ name: z.string().trim().min(1).max(200), slug: SlugSchema })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Provide at least one field'),
        response: { 200: OrgSchema, ...errorResponses(400, 401, 403, 404, 409) },
      },
    },
    async (req) => {
      const { organizationId, role } = membershipOf(req);
      const org = await app.prisma.organization
        .update({ where: { id: organizationId }, data: req.body })
        .catch(slugTaken);
      return toOrgDto(org, role);
    },
  );
};
