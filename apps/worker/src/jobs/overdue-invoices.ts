import type { PrismaClient } from '@finance-os/db';

/** Midnight UTC of the day containing `now` — invoice due dates are plain dates. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Mark sent / partially_paid invoices whose due date is before today (UTC) as overdue.
 * Deliberately cross-organisation: this is a system maintenance job. One set-based UPDATE.
 */
export async function processOverdueInvoices(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.invoice.updateMany({
    where: { status: { in: ['sent', 'partially_paid'] }, dueDate: { lt: startOfUtcDay(now) } },
    data: { status: 'overdue' },
  });
  return count;
}
