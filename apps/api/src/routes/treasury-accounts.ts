import { conflict, notFound, OrgParamsSchema, OrgResourceParamsSchema } from '@finance-os/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isForeignKeyViolation, isUniqueViolation } from '../db-errors.js';
import { iso } from '../lib/serialize.js';
import { membershipOf, requireOrgPermission } from '../plugins/auth.js';
import { bearerSecurity, DateTimeString, errorResponses } from '../schemas/common.js';
import { PublicKeyInput } from '../schemas/stellar.js';

const TreasuryAccountSchema = z.object({
  id: z.uuid(),
  stellarAddress: z.string(),
  label: z.string(),
  network: z.enum(['testnet', 'mainnet']),
  indexerCursor: z.string().nullable(),
  createdAt: DateTimeString,
});

type Row = {
  id: string;
  stellarAddress: string;
  label: string;
  network: 'testnet' | 'mainnet';
  indexerCursor: string | null;
  createdAt: Date;
};
const toDto = (t: Row) => ({
  id: t.id,
  stellarAddress: t.stellarAddress,
  label: t.label,
  network: t.network,
  indexerCursor: t.indexerCursor,
  createdAt: iso(t.createdAt),
});

const LabelInput = z.string().trim().min(1).max(100);
const tags = ['treasury-accounts'];

export const treasuryAccountRoutes: FastifyPluginAsyncZod = async (app) => {
  const findOwned = async (organizationId: string, id: string) => {
    const account = await app.prisma.treasuryAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw notFound('Treasury account');
    return account;
  };

  app.get(
    '/orgs/:orgId/treasury-accounts',
    {
      preHandler: requireOrgPermission('org:read'),
      schema: {
        tags,
        summary: 'List treasury accounts',
        security: bearerSecurity,
        params: OrgParamsSchema,
        response: {
          200: z.object({ items: z.array(TreasuryAccountSchema) }),
          ...errorResponses(401, 404),
        },
      },
    },
    async (req) => {
      const { organizationId } = membershipOf(req);
      const rows = await app.prisma.treasuryAccount.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
      return { items: rows.map(toDto) };
    },
  );

  app.get(
    '/orgs/:orgId/treasury-accounts/:id',
    {
      preHandler: requireOrgPermission('org:read'),
      schema: {
        tags,
        summary: 'Get a treasury account',
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        response: { 200: TreasuryAccountSchema, ...errorResponses(401, 404) },
      },
    },
    async (req) => toDto(await findOwned(membershipOf(req).organizationId, req.params.id)),
  );

  app.post(
    '/orgs/:orgId/treasury-accounts',
    {
      preHandler: requireOrgPermission('treasury:manage'),
      schema: {
        tags,
        summary: 'Register a Stellar account the org controls, so the indexer watches it',
        security: bearerSecurity,
        params: OrgParamsSchema,
        body: z.object({ stellarAddress: PublicKeyInput, label: LabelInput }),
        response: { 201: TreasuryAccountSchema, ...errorResponses(400, 401, 403, 404, 409) },
      },
    },
    async (req, reply) => {
      const { organizationId } = membershipOf(req);
      const account = await app.prisma.treasuryAccount
        .create({
          data: {
            organizationId,
            stellarAddress: req.body.stellarAddress,
            label: req.body.label,
            // Always the server's network: a testnet API can't register mainnet accounts.
            network: app.stellar.network,
          },
        })
        .catch((err: unknown) => {
          if (isUniqueViolation(err)) throw conflict('This account is already registered');
          throw err;
        });
      return reply.status(201).send(toDto(account));
    },
  );

  app.patch(
    '/orgs/:orgId/treasury-accounts/:id',
    {
      preHandler: requireOrgPermission('treasury:manage'),
      schema: {
        tags,
        summary: 'Rename a treasury account',
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        body: z.object({ label: LabelInput }),
        response: { 200: TreasuryAccountSchema, ...errorResponses(400, 401, 403, 404) },
      },
    },
    async (req) => {
      const { organizationId } = membershipOf(req);
      const existing = await findOwned(organizationId, req.params.id);
      const updated = await app.prisma.treasuryAccount.update({
        where: { id: existing.id },
        data: { label: req.body.label },
      });
      return toDto(updated);
    },
  );

  app.delete(
    '/orgs/:orgId/treasury-accounts/:id',
    {
      preHandler: requireOrgPermission('treasury:manage'),
      schema: {
        tags,
        summary: 'Stop watching a treasury account (only if nothing references it)',
        security: bearerSecurity,
        params: OrgResourceParamsSchema,
        response: { 204: z.null(), ...errorResponses(401, 403, 404, 409) },
      },
    },
    async (req, reply) => {
      const { organizationId } = membershipOf(req);
      const existing = await findOwned(organizationId, req.params.id);
      await app.prisma.treasuryAccount
        .delete({ where: { id: existing.id } })
        .catch((err: unknown) => {
          if (isForeignKeyViolation(err)) {
            throw conflict('Invoices, payment requests or transactions reference this account');
          }
          throw err;
        });
      return reply.status(204).send(null);
    },
  );
};
