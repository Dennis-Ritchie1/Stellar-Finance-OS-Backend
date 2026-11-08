import type { PrismaClient } from '../generated/prisma/client.js';
import { seedApprovalPolicy, seedPendingPaymentRequest } from './approvals.js';
import { seedClients } from './clients.js';
import { DEMO_ORG } from './data.js';
import { seedInvoices } from './invoices.js';
import { seedOrganization } from './organization.js';
import { seedPartialPayment } from './payments.js';
import { resolveTreasuryAddress, seedTreasuryAccount } from './treasury.js';
import { seedUsers } from './users.js';
import { seedVendors } from './vendors.js';

export type SeedResult =
  | { status: 'skipped'; organizationId: string }
  | { status: 'created'; organizationId: string; treasuryAddress: string; generatedTreasury: boolean };

/**
 * Create the demo org and everything under it in one transaction.
 * Idempotent: if the demo org already exists, nothing is changed.
 */
export async function seedDemo(
  prisma: PrismaClient,
  env: Record<string, string | undefined>,
  now: Date = new Date(),
): Promise<SeedResult> {
  const existing = await prisma.organization.findUnique({ where: { slug: DEMO_ORG.slug } });
  if (existing) return { status: 'skipped', organizationId: existing.id };

  const usdcIssuer = env.USDC_ISSUER || null;
  const { address, generated } = resolveTreasuryAddress(env);

  return prisma.$transaction(
    async (tx) => {
      const userIds = await seedUsers(tx);
      const { organizationId, membersByRole } = await seedOrganization(tx, userIds);
      const treasury = await seedTreasuryAccount(tx, organizationId, address);
      const clientIds = await seedClients(tx, organizationId);
      const vendorIds = await seedVendors(tx, organizationId);
      const invoiceIds = await seedInvoices(tx, { organizationId, clientIds, treasury, usdcIssuer, now });
      await seedPartialPayment(tx, { organizationId, treasury, invoiceIds, now });
      const ctx = { organizationId, membersByRole, vendorIds, treasuryAccountId: treasury.id, usdcIssuer };
      await seedApprovalPolicy(tx, ctx);
      await seedPendingPaymentRequest(tx, ctx);
      return { status: 'created' as const, organizationId, treasuryAddress: address, generatedTreasury: generated };
    },
    { timeout: 30_000 },
  );
}
