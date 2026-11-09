import { randomBytes } from 'node:crypto';
import { startTestDatabase, type TestDatabase } from '@finance-os/db/testing';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processMatchTransaction } from '../src/jobs/match-transaction.js';
import { processOverdueInvoices } from '../src/jobs/overdue-invoices.js';

const log = pino({ level: 'silent' });
const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('worker jobs', () => {
  let db: TestDatabase;
  let organizationId: string;
  let treasuryAccountId: string;
  let clientId: string;
  let seq = 0;

  beforeAll(async () => {
    db = await startTestDatabase();
    const org = await db.prisma.organization.create({ data: { name: 'Acme', slug: 'acme' } });
    organizationId = org.id;
    const t = await db.prisma.treasuryAccount.create({
      data: {
        organizationId,
        stellarAddress: 'G' + 'A'.repeat(55),
        label: 'Main',
        network: 'testnet',
      },
    });
    treasuryAccountId = t.id;
    clientId = (await db.prisma.client.create({ data: { organizationId, name: 'Client' } })).id;
  });
  afterAll(() => db?.stop());

  const invoice = (o: Record<string, unknown> = {}) => {
    seq++;
    return db.prisma.invoice.create({
      data: {
        organizationId,
        clientId,
        treasuryAccountId,
        number: `INV-${seq}-${randomBytes(3).toString('hex')}`,
        assetCode: 'USDC',
        assetIssuer: ISSUER,
        amount: '100',
        dueDate: new Date('2099-01-01'),
        status: 'sent',
        publicToken: randomBytes(16).toString('hex'),
        ...o,
      },
    });
  };
  const payment = (muxedId: string | null, o: Record<string, unknown> = {}) =>
    db.prisma.transaction.create({
      data: {
        organizationId,
        treasuryAccountId,
        txHash: randomBytes(32).toString('hex'),
        operationIndex: 0,
        pagingToken: String(++seq),
        direction: 'in',
        operationType: 'payment',
        status: 'success',
        from: 'G' + 'B'.repeat(55),
        to: 'G' + 'A'.repeat(55),
        assetCode: 'USDC',
        assetIssuer: ISSUER,
        amount: '100',
        muxedId,
        ledger: 1,
        createdAt: new Date(),
        ...o,
      },
    });
  const run = (transactionId: string) =>
    processMatchTransaction({ prisma: db.prisma, log }, { transactionId });

  it('moves a muxed-referenced invoice sent → paid with one muxed/1 match', async () => {
    const inv = await invoice();
    const tx = await payment(inv.paymentRefId.toString());
    expect(await run(tx.id)).toBe('matched');

    const after = await db.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe('paid');
    expect(after.paidAt).not.toBeNull();
    expect(after.amountPaid.toFixed(7)).toBe('100.0000000');
    const matches = await db.prisma.paymentMatch.findMany({ where: { transactionId: tx.id } });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ method: 'muxed', invoiceId: inv.id });
    expect(matches[0]!.confidence.toString()).toBe('1');
    const client = await db.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.knownAddresses).toContain(tx.from);
  });

  it('concurrent partial payments sum exactly', async () => {
    const inv = await invoice({ amount: '100' });
    const ref = inv.paymentRefId.toString();
    const txs = await Promise.all(
      ['10.1234567', '20.0000001', '30.5'].map((amount) => payment(ref, { amount })),
    );
    await Promise.all(txs.map((t) => run(t.id)));

    const after = await db.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.amountPaid.toFixed(7)).toBe('60.6234568');
    expect(after.status).toBe('partially_paid');
    expect(await db.prisma.paymentMatch.count({ where: { invoiceId: inv.id } })).toBe(3);
  });

  it('running the same job twice (even concurrently) creates one match', async () => {
    const inv = await invoice();
    const tx = await payment(inv.paymentRefId.toString(), { amount: '40' });
    await Promise.all([run(tx.id), run(tx.id)]);
    await run(tx.id);
    expect(await db.prisma.paymentMatch.count({ where: { transactionId: tx.id } })).toBe(1);
    const after = await db.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.amountPaid.toFixed(7)).toBe('40.0000000');
  });

  it('flags a wrong-asset payment and leaves the invoice untouched', async () => {
    const inv = await invoice();
    const tx = await payment(inv.paymentRefId.toString(), { assetCode: 'XLM', assetIssuer: null });
    expect(await run(tx.id)).toBe('flagged');

    const after = await db.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe('sent');
    expect(after.amountPaid.toFixed(7)).toBe('0.0000000');
    const t = await db.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(t.matchStatus).toBe('flagged');
    expect(t.matchNote).toContain('wrong_asset');
    expect(await db.prisma.paymentMatch.count({ where: { transactionId: tx.id } })).toBe(0);
  });

  it('records a suggestion for a reference-less payment without matching', async () => {
    const inv = await invoice({ amount: '77' });
    const tx = await payment(null, { amount: '77' });
    expect(await run(tx.id)).toBe('suggested');
    const t = await db.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(t.matchStatus).toBe('suggested');
    expect(t.matchNote).toContain(inv.id);
    expect(await db.prisma.paymentMatch.count({ where: { transactionId: tx.id } })).toBe(0);
  });

  it('never matches across organizations', async () => {
    const other = await db.prisma.organization.create({ data: { name: 'Other', slug: 'other' } });
    const otherTreasury = await db.prisma.treasuryAccount.create({
      data: {
        organizationId: other.id,
        stellarAddress: 'G' + 'C'.repeat(55),
        label: 'X',
        network: 'testnet',
      },
    });
    const inv = await invoice();
    const tx = await payment(inv.paymentRefId.toString(), {
      organizationId: other.id,
      treasuryAccountId: otherTreasury.id,
    });
    expect(await run(tx.id)).toBe('flagged');
    const after = await db.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe('sent');
  });

  it('hands an outgoing tx that matches a PaymentRequest to settlement', async () => {
    const vendor = await db.prisma.vendor.create({
      data: { organizationId, name: 'V', stellarAddress: 'G' + 'D'.repeat(55) },
    });
    const user = await db.prisma.user.create({
      data: { email: `u${seq}@x.test`, passwordHash: 'x' },
    });
    const member = await db.prisma.member.create({
      data: { organizationId, userId: user.id, role: 'owner' },
    });
    const txHash = randomBytes(32).toString('hex');
    const pr = await db.prisma.paymentRequest.create({
      data: {
        organizationId,
        vendorId: vendor.id,
        assetCode: 'USDC',
        amount: '5',
        reason: 'r',
        createdByMemberId: member.id,
        sourceTreasuryAccountId: treasuryAccountId,
        txHash,
      },
    });
    const tx = await payment(null, { direction: 'out', txHash });
    const calls: string[] = [];
    const outcome = await processMatchTransaction(
      { prisma: db.prisma, log, settlePaymentRequest: async (_t, id) => void calls.push(id) },
      { transactionId: tx.id },
    );
    expect(outcome).toBe('settlement');
    expect(calls).toEqual([pr.id]);
  });

  it('overdue job marks only past-due sent/partially_paid invoices', async () => {
    const past = new Date('2020-01-01');
    const sent = await invoice({ status: 'sent', dueDate: past });
    const partial = await invoice({ status: 'partially_paid', dueDate: past });
    const future = await invoice({ status: 'sent', dueDate: new Date('2099-01-01') });
    const others = await Promise.all(
      (['paid', 'void', 'draft'] as const).map((status) => invoice({ status, dueDate: past })),
    );

    const count = await processOverdueInvoices(db.prisma);
    expect(count).toBeGreaterThanOrEqual(2);
    const status = async (id: string) =>
      (await db.prisma.invoice.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(sent.id)).toBe('overdue');
    expect(await status(partial.id)).toBe('overdue');
    expect(await status(future.id)).toBe('sent');
    expect(await Promise.all(others.map((i) => status(i.id)))).toEqual(['paid', 'void', 'draft']);
  });

  it('does not mark an invoice due today (UTC) as overdue', async () => {
    const now = new Date('2030-06-15T23:59:00Z');
    const today = await invoice({ status: 'sent', dueDate: new Date('2030-06-15') });
    const yesterday = await invoice({ status: 'sent', dueDate: new Date('2030-06-14') });
    await processOverdueInvoices(db.prisma, now);
    const s = async (id: string) =>
      (await db.prisma.invoice.findUniqueOrThrow({ where: { id } })).status;
    expect(await s(today.id)).toBe('sent');
    expect(await s(yesterday.id)).toBe('overdue');
  });
});
