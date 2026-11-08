/** Queue names shared between producers (api, indexer) and this worker. */
export const QUEUES = {
  matchTransaction: 'match-transaction',
  overdueInvoices: 'overdue-invoices',
  generateReport: 'generate-report',
  sendEmail: 'send-email',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
