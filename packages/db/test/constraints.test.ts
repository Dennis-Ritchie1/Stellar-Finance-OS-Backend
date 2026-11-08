import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo } from '../src/seed/seed-demo.js';
import { startTestDatabase, type TestDatabase } from './postgres.js';

describe('database constraints', () => {
  let db: TestDatabase;
  let organizationId: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    ({ organizationId } = await seedDemo(db.prisma, {}));
  });
  afterAll(() => db?.stop());

  const txData = async () => {
    const treasury = await db.prisma.treasuryAccount.findFirstOrThrow();
    return {
      organizationId,
      treasuryAccountId: treasury.id,
      txHash: randomBytes(32).toString('hex'),
      operationIndex: 0,
      pagingToken: '1',
      direction: 'in' as const,
      operationType: 'payment' as const,
      status: 'success' as const,
      from: treasury.stellarAddress,
      to: treasury.stellarAddress,
      assetCode: 'USDC',
      amount: '10',
      ledger: 2,
      createdAt: new Date(),
    };
  };

  it('rejects a duplicate (txHash, operationIndex) — indexer idempotency key', async () => {
    const data = await txData();
    await db.prisma.transaction.create({ data });
    await expect(db.prisma.transaction.create({ data })).rejects.toThrow();
  });

  it('allows the same txHash with a different operationIndex', async () => {
    const data = await txData();
    await db.prisma.transaction.create({ data });
    await expect(
      db.prisma.transaction.create({ data: { ...data, operationIndex: 1 } }),
    ).resolves.toBeDefined();
  });

  it('rejects a payment match with no target', async () => {
    const t = await db.prisma.transaction.create({ data: await txData() });
    await expect(
      db.prisma.paymentMatch.create({
        data: { organizationId, transactionId: t.id, amount: '1', method: 'manual', confidence: '1' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a payment match with both an invoice and a payment request', async () => {
    const t = await db.prisma.transaction.create({ data: await txData() });
    const invoice = await db.prisma.invoice.findFirstOrThrow();
    const pr = await db.prisma.paymentRequest.findFirstOrThrow();
    await expect(
      db.prisma.paymentMatch.create({
        data: {
          organizationId,
          transactionId: t.id,
          invoiceId: invoice.id,
          paymentRequestId: pr.id,
          amount: '1',
          method: 'manual',
          confidence: '1',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects non-positive invoice amounts', async () => {
    const invoice = await db.prisma.invoice.findFirstOrThrow();
    await expect(
      db.prisma.invoice.update({ where: { id: invoice.id }, data: { amount: '0' } }),
    ).rejects.toThrow();
  });

  it('rejects an approval policy threshold below 1', async () => {
    await expect(
      db.prisma.approvalPolicy.create({ data: { organizationId, name: 'bad', threshold: 0 } }),
    ).rejects.toThrow();
  });

  it('allows only one decision per member per payment request', async () => {
    const approval = await db.prisma.approval.findFirstOrThrow();
    await expect(
      db.prisma.approval.create({
        data: {
          organizationId,
          paymentRequestId: approval.paymentRequestId,
          memberId: approval.memberId,
          decision: 'rejected',
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps 7 decimal places without float drift', async () => {
    const t = await db.prisma.transaction.create({
      data: { ...(await txData()), amount: '0.1000001' },
    });
    expect(t.amount.toFixed(7)).toBe('0.1000001');
  });
});
