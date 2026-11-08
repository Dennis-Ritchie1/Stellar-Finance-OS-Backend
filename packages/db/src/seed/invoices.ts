import { addAmounts, multiplyAmounts } from '@finance-os/shared';
import { DEMO_INVOICES } from './data.js';
import { deriveMuxedAddress, invoiceMemo, newPublicToken } from './references.js';
import type { Tx } from './types.js';

interface InvoiceSeedContext {
  organizationId: string;
  clientIds: string[];
  treasury: { id: string; stellarAddress: string };
  usdcIssuer: string | null;
  now: Date;
}

/** Create demo invoices with line items and muxed/memo references. Returns number → id. */
export async function seedInvoices(tx: Tx, ctx: InvoiceSeedContext): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const inv of DEMO_INVOICES) {
    const lines = inv.lineItems.map((l, position) => ({
      position,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: multiplyAmounts(l.quantity, l.unitPrice),
    }));
    const dueDate = new Date(ctx.now.getTime() + inv.dueInDays * 86_400_000);
    const created = await tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: ctx.clientIds[inv.clientIndex]!,
        treasuryAccountId: ctx.treasury.id,
        number: inv.number,
        assetCode: 'USDC',
        assetIssuer: ctx.usdcIssuer,
        amount: addAmounts(...lines.map((l) => l.amount)),
        dueDate,
        status: inv.status,
        sentAt: inv.status === 'draft' ? null : ctx.now,
        memo: invoiceMemo(inv.number),
        publicToken: newPublicToken(),
        lineItems: {
          create: lines.map((l) => ({ ...l, organizationId: ctx.organizationId })),
        },
      },
    });
    // The muxed id is the DB-assigned paymentRefId, so derive the M-address after insert.
    await tx.invoice.update({
      where: { id: created.id },
      data: { muxedAddress: deriveMuxedAddress(ctx.treasury.stellarAddress, created.paymentRefId) },
    });
    ids.set(inv.number, created.id);
  }
  return ids;
}
