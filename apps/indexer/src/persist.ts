import type { PrismaClient } from '@finance-os/db';
import { baseAccountOf, type ObservedPayment } from '@finance-os/stellar';
import type { MatchQueue } from './queue.js';

export interface WatchedAccount {
  id: string;
  organizationId: string;
  stellarAddress: string;
}

export type Direction = 'in' | 'out';

/**
 * `in` when the payment's destination (muxed or not) belongs to the account,
 * otherwise `out`. A self-payment (from === to === account) is therefore
 * recorded once, as `in`: it moves no money, and one row keeps balances and
 * matching simple.
 */
export function directionOf(payment: ObservedPayment, account: WatchedAccount): Direction {
  return baseAccountOf(payment.to) === account.stellarAddress ? 'in' : 'out';
}

/**
 * Record one payment idempotently and enqueue matching.
 *
 * 1. In ONE transaction: upsert the Transaction on (txHash, operationIndex)
 *    and move the account cursor forward (never backwards).
 * 2. After commit: enqueue `match-transaction` with a deterministic jobId.
 *
 * If step 1 throws, nothing is written and the cursor stays put, so the
 * caller retries from the same payment. Re-delivery is harmless: the upsert
 * is a no-op rewrite and the jobId dedupes the job.
 */
export async function persistPayment(
  prisma: PrismaClient,
  account: WatchedAccount,
  payment: ObservedPayment,
  queue: MatchQueue,
): Promise<{ transactionId: string }> {
  const data = {
    organizationId: account.organizationId,
    treasuryAccountId: account.id,
    pagingToken: payment.pagingToken,
    direction: directionOf(payment, account),
    operationType: payment.operationType,
    status: payment.successful ? ('success' as const) : ('failed' as const),
    createdAt: payment.createdAt,
    from: payment.from,
    to: payment.to,
    assetCode: payment.assetCode,
    assetIssuer: payment.assetIssuer ?? null,
    // Decimal string straight to Prisma — never a JS number (AGENTS.md #2).
    amount: payment.amount,
    memo: payment.memo ?? null,
    memoType: payment.memoType,
    muxedId: payment.muxedId ?? null,
    ledger: payment.ledger,
  };

  const row = await prisma.$transaction(async (tx) => {
    const saved = await tx.transaction.upsert({
      where: {
        txHash_operationIndex: { txHash: payment.txHash, operationIndex: payment.operationIndex },
      },
      create: { txHash: payment.txHash, operationIndex: payment.operationIndex, ...data },
      update: data,
      select: { id: true },
    });
    // Monotonic cursor. Paging tokens are numeric strings beyond 2^53, so
    // compare in SQL as numeric rather than lexically.
    await tx.$executeRaw`
      UPDATE "treasury_accounts"
      SET "indexerCursor" = ${payment.pagingToken}
      WHERE "id" = ${account.id}::uuid
        AND ("indexerCursor" IS NULL
             OR "indexerCursor"::numeric < ${payment.pagingToken}::numeric)`;
    return saved;
  });

  await queue.enqueue({
    transactionId: row.id,
    organizationId: account.organizationId,
    txHash: payment.txHash,
    operationIndex: payment.operationIndex,
  });
  return { transactionId: row.id };
}
