import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { DEMO_PARTIAL_PAYMENT } from './data.js';
import type { Tx } from './types.js';

interface PaymentSeedContext {
  organizationId: string;
  treasury: { id: string; stellarAddress: string };
  invoiceIds: Map<string, string>;
  now: Date;
}

/**
 * A synthetic incoming payment matched to INV-2026-0003 via its muxed id, so
 * the dashboard has a partially-paid invoice whose numbers add up.
 * The tx hash is random — this row exists only in local dev databases.
 */
export async function seedPartialPayment(tx: Tx, ctx: PaymentSeedContext): Promise<void> {
  const invoiceId = ctx.invoiceIds.get(DEMO_PARTIAL_PAYMENT.invoiceNumber)!;
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const payer = Keypair.random().publicKey();

  const transaction = await tx.transaction.create({
    data: {
      organizationId: ctx.organizationId,
      treasuryAccountId: ctx.treasury.id,
      txHash: randomBytes(32).toString('hex'),
      operationIndex: 0,
      pagingToken: '0',
      direction: 'in',
      operationType: 'payment',
      status: 'success',
      from: payer,
      to: invoice.muxedAddress ?? ctx.treasury.stellarAddress,
      assetCode: invoice.assetCode,
      assetIssuer: invoice.assetIssuer,
      amount: DEMO_PARTIAL_PAYMENT.amount,
      muxedId: invoice.paymentRefId.toString(),
      ledger: 1,
      createdAt: ctx.now,
    },
  });

  await tx.paymentMatch.create({
    data: {
      organizationId: ctx.organizationId,
      transactionId: transaction.id,
      invoiceId,
      amount: DEMO_PARTIAL_PAYMENT.amount,
      method: 'muxed',
      confidence: '1',
    },
  });

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: DEMO_PARTIAL_PAYMENT.amount },
  });
  await tx.client.update({
    where: { id: invoice.clientId },
    data: { knownAddresses: { push: payer } },
  });
}
