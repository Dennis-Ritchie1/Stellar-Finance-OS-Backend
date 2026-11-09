/** Queue names and job payloads shared by producers (api, indexer) and the worker. */
export const QUEUES = {
  matchTransaction: 'match-transaction',
  overdueInvoices: 'overdue-invoices',
  generateReport: 'generate-report',
  sendEmail: 'send-email',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface MatchTransactionJob {
  transactionId: string;
}

export type OverdueInvoicesJob = Record<string, never>;
