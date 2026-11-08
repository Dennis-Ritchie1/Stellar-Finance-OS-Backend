import { addAmounts } from '@finance-os/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../src/seed/data.js';
import { seedDemo } from '../src/seed/seed-demo.js';
import { startTestDatabase, type TestDatabase } from './postgres.js';

describe('seedDemo', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await startTestDatabase();
  });
  afterAll(() => db?.stop());

  it('creates the demo org with members, treasury, clients and vendors', async () => {
    const result = await seedDemo(db.prisma, {});
    expect(result.status).toBe('created');
    const org = await db.prisma.organization.findUniqueOrThrow({
      where: { slug: 'demo' },
      include: { members: true, treasuryAccounts: true, clients: true, vendors: true },
    });
    expect(org.members).toHaveLength(DEMO_USERS.length);
    expect(org.treasuryAccounts).toHaveLength(1);
    expect(org.treasuryAccounts[0]!.network).toBe('testnet');
    expect(org.clients).toHaveLength(2);
    expect(org.vendors).toHaveLength(2);
  });

  it('computes invoice totals exactly from line items', async () => {
    const inv = await db.prisma.invoice.findFirstOrThrow({ where: { number: 'INV-2026-0001' } });
    expect(inv.amount.toFixed(7)).toBe('1751.0000000');
  });

  it('gives every invoice a muxed address, memo and public token', async () => {
    const invoices = await db.prisma.invoice.findMany();
    for (const inv of invoices) {
      expect(inv.muxedAddress).toMatch(/^M[A-Z2-7]{68}$/);
      expect(inv.memo).toMatch(/^INV\d{4}$/);
      expect(inv.publicToken).toBeTruthy();
    }
  });

  it('keeps amountPaid consistent with payment matches', async () => {
    const inv = await db.prisma.invoice.findFirstOrThrow({
      where: { number: 'INV-2026-0003' },
      include: { matches: true },
    });
    expect(inv.status).toBe('partially_paid');
    const matched = addAmounts(...inv.matches.map((m) => m.amount.toFixed(7)));
    expect(matched).toBe(inv.amountPaid.toFixed(7));
    expect(inv.amountPaid.toFixed(7)).toBe('250.0000000');
  });

  it('creates a pending payment request with one approval toward a 2-of-N policy', async () => {
    const policy = await db.prisma.approvalPolicy.findFirstOrThrow({
      include: { approvers: true },
    });
    expect(policy.threshold).toBe(2);
    expect(policy.approvers.length).toBeGreaterThanOrEqual(2);
    const pr = await db.prisma.paymentRequest.findFirstOrThrow({ include: { approvals: true } });
    expect(pr.status).toBe('pending_approval');
    expect(pr.approvals).toHaveLength(1);
  });

  it('is idempotent', async () => {
    const before = await db.prisma.invoice.count();
    const again = await seedDemo(db.prisma, {});
    expect(again.status).toBe('skipped');
    expect(await db.prisma.invoice.count()).toBe(before);
  });
});
