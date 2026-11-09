import type { PrismaClient } from '@finance-os/db';
import {
  matchTransaction,
  type ClientHistory,
  type MatchResult,
  type OpenInvoice,
} from '@finance-os/matching';
import type { MatchTransactionJob } from '@finance-os/shared';
import type { Logger } from '../logger.js';

type Tx = Awaited<ReturnType<PrismaClient['transaction']['findUniqueOrThrow']>>;

export interface MatchDeps {
  prisma: PrismaClient;
  log: Logger;
  /** Outgoing tx that settles a PaymentRequest (issue 7). Default: log only. */
  settlePaymentRequest?: (tx: Tx, paymentRequestId: string) => Promise<void>;
}

export type MatchOutcome =
  'not_found' | 'skipped' | 'already_matched' | 'settlement' | 'matched' | MatchResult['kind'];

const OPEN_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;

function toMatchable(tx: Tx) {
  return {
    id: tx.id,
    direction: tx.direction,
    assetCode: tx.assetCode,
    assetIssuer: tx.assetIssuer,
    amount: tx.amount.toFixed(7),
    memo: tx.memo,
    memoType: tx.memoType,
    muxedId: tx.muxedId,
    from: tx.from,
    createdAt: tx.createdAt,
  };
}

function toOpenInvoice(i: {
  id: string;
  clientId: string;
  paymentRefId: bigint;
  assetCode: string;
  assetIssuer: string | null;
  amount: { toFixed(n: number): string };
  amountPaid: { toFixed(n: number): string };
  status: OpenInvoice['status'];
  dueDate: Date;
}): OpenInvoice {
  return {
    id: i.id,
    clientId: i.clientId,
    paymentRefId: i.paymentRefId.toString(),
    assetCode: i.assetCode,
    assetIssuer: i.assetIssuer,
    amount: i.amount.toFixed(7),
    amountPaid: i.amountPaid.toFixed(7),
    status: i.status,
    dueDate: i.dueDate,
  };
}

/** Persist a non-settling outcome so the UI can list it (null clears a stale one). */
async function recordOutcome(prisma: PrismaClient, tx: Tx, result: MatchResult) {
  let matchStatus: 'suggested' | 'flagged' | null = null;
  let matchNote: string | null = null;
  if (result.kind === 'flagged') {
    matchStatus = 'flagged';
    matchNote = result.invoiceId ? `${result.reason}: ${result.invoiceId}` : result.reason;
  } else if (result.kind === 'suggested') {
    matchStatus = 'suggested';
    matchNote = result.candidates.map((c) => `${c.invoiceId}:${c.score}`).join(',');
  } else if (result.kind === 'matched' && result.overpaidBy !== '0.0000000') {
    matchStatus = 'flagged';
    matchNote = `overpayment: ${result.overpaidBy} over invoice ${result.invoiceId}`;
  }
  await prisma.transaction.updateMany({
    where: { id: tx.id, organizationId: tx.organizationId },
    data: { matchStatus, matchNote },
  });
}

/**
 * Apply a deterministic match. The invoice row is locked (SELECT … FOR UPDATE) so concurrent
 * partial payments serialise; the engine is re-run on the locked row so amountPaid is never stale.
 * Returns "already_matched" if a duplicate run committed first, or the new engine result if the
 * invoice no longer accepts this payment.
 */
async function applyMatch(
  prisma: PrismaClient,
  tx: Tx,
  invoiceId: string,
): Promise<'matched' | 'already_matched' | MatchResult> {
  return prisma.$transaction(async (db) => {
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM invoices
      WHERE id = ${invoiceId}::uuid AND "organizationId" = ${tx.organizationId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) return { kind: 'unmatched' } as MatchResult;

    // Re-check idempotency under the lock: a duplicate run may have just committed.
    const dup = await db.paymentMatch.findFirst({
      where: { transactionId: tx.id, organizationId: tx.organizationId },
    });
    if (dup) return 'already_matched';

    const fresh = await db.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId: tx.organizationId },
    });
    const result = matchTransaction(toMatchable(tx), [toOpenInvoice(fresh)], {});
    if (result.kind !== 'matched') return result;

    await db.paymentMatch.create({
      data: {
        organizationId: tx.organizationId,
        transactionId: tx.id,
        invoiceId,
        amount: result.appliedAmount,
        method: result.method,
        confidence: result.confidence.toString(),
      },
    });
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: { increment: result.appliedAmount },
        status: result.newStatus,
        ...(result.newStatus === 'paid' ? { paidAt: tx.createdAt } : {}),
      },
    });
    // Remember the payer for heuristic matching (idempotent: only when not yet known).
    await db.client.updateMany({
      where: {
        id: fresh.clientId,
        organizationId: tx.organizationId,
        NOT: { knownAddresses: { has: tx.from } },
      },
      data: { knownAddresses: { push: tx.from } },
    });
    await db.transaction.update({
      where: { id: tx.id },
      data:
        result.overpaidBy === '0.0000000'
          ? { matchStatus: null, matchNote: null }
          : {
              matchStatus: 'flagged',
              matchNote: `overpayment: ${result.overpaidBy} over invoice ${invoiceId}`,
            },
    });
    return 'matched';
  });
}

export async function processMatchTransaction(
  deps: MatchDeps,
  job: MatchTransactionJob,
): Promise<MatchOutcome> {
  const { prisma, log } = deps;
  const tx = await prisma.transaction.findUnique({ where: { id: job.transactionId } });
  if (!tx) {
    log.warn({ transactionId: job.transactionId }, 'transaction not found');
    return 'not_found';
  }
  if (tx.status !== 'success') return 'skipped';

  const existing = await prisma.paymentMatch.findFirst({
    where: { transactionId: tx.id, organizationId: tx.organizationId },
  });
  if (existing) return 'already_matched';

  if (tx.direction === 'out') {
    const request = await prisma.paymentRequest.findFirst({
      where: { txHash: tx.txHash, organizationId: tx.organizationId },
    });
    if (request) {
      if (deps.settlePaymentRequest) await deps.settlePaymentRequest(tx, request.id);
      else log.info({ paymentRequestId: request.id }, 'settlement handler not configured');
      return 'settlement';
    }
    return 'unmatched';
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: tx.organizationId,
      treasuryAccountId: tx.treasuryAccountId,
      status: { in: [...OPEN_STATUSES] },
    },
    include: { client: { select: { id: true, knownAddresses: true } } },
  });
  const history: ClientHistory = {};
  for (const i of invoices) history[i.clientId] = { knownAddresses: i.client.knownAddresses };

  const result = matchTransaction(toMatchable(tx), invoices.map(toOpenInvoice), history);

  if (result.kind === 'matched') {
    const applied = await applyMatch(prisma, tx, result.invoiceId);
    if (applied === 'matched' || applied === 'already_matched') {
      log.info({ transactionId: tx.id, invoiceId: result.invoiceId, outcome: applied }, 'match');
      return applied;
    }
    // Invoice changed under us (e.g. paid by a concurrent job): record the new outcome instead.
    await recordOutcome(prisma, tx, applied);
    return applied.kind;
  }

  await recordOutcome(prisma, tx, result);
  log.info({ transactionId: tx.id, outcome: result.kind }, 'match');
  return result.kind;
}
