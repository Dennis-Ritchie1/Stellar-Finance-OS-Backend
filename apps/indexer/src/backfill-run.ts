import type { PrismaClient } from '@finance-os/db';
import type { PaymentSource } from '@finance-os/stellar';
import type { StellarNetwork } from '@finance-os/shared';
import { resolveFrom } from './cursor.js';
import type { Logger } from './logger.js';
import { persistPayment } from './persist.js';
import type { MatchQueue } from './queue.js';

export interface BackfillOptions {
  prisma: PrismaClient;
  source: PaymentSource;
  queue: MatchQueue;
  network: StellarNetwork;
  log: Pick<Logger, 'info'>;
  address: string;
  /** Raw paging token, `ledger:<n>`, or undefined for the beginning. */
  from?: string | undefined;
  pageSize?: number;
}

/** Page through history, persisting via the same path as the live stream. */
export async function runBackfill(
  opts: BackfillOptions,
): Promise<{ payments: number; pages: number }> {
  const account = await opts.prisma.treasuryAccount.findUnique({
    where: { network_stellarAddress: { network: opts.network, stellarAddress: opts.address } },
    select: { id: true, organizationId: true, stellarAddress: true },
  });
  if (!account) {
    throw new Error(`${opts.address} is not a TreasuryAccount on ${opts.network}; add it first`);
  }
  let cursor = resolveFrom(opts.from);
  let payments = 0;
  let pages = 0;
  for (;;) {
    const page = await opts.source.page(opts.address, cursor, opts.pageSize);
    if (page.nextCursor === null) break;
    for (const payment of page.payments) {
      await persistPayment(opts.prisma, account, payment, opts.queue);
    }
    payments += page.payments.length;
    pages += 1;
    cursor = page.nextCursor;
    opts.log.info({ page: pages, payments, cursor }, 'backfill progress');
  }
  return { payments, pages };
}
