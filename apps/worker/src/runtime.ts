import type { PrismaClient } from '@finance-os/db';
import { QUEUES, type MatchTransactionJob } from '@finance-os/shared';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { processMatchTransaction } from './jobs/match-transaction.js';
import { processOverdueInvoices } from './jobs/overdue-invoices.js';
import type { Logger } from './logger.js';

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Log a dead-letter line once a job has used up all its attempts. */
export function logIfExhausted(log: Logger, job: Job | undefined, err: Error): void {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attempts) {
    log.error(
      { queue: job.queueName, jobId: job.id, data: job.data, attempts, err: err.message },
      'job exhausted retries (dead-letter)',
    );
  } else {
    log.warn({ queue: job.queueName, jobId: job.id, attemptsMade: job.attemptsMade }, 'job failed');
  }
}

export interface Runtime {
  /** Finish in-flight jobs, then release Redis. */
  close: () => Promise<void>;
}

export async function startRuntime(opts: {
  redisUrl: string;
  prisma: PrismaClient;
  log: Logger;
}): Promise<Runtime> {
  const { prisma, log } = opts;
  // BullMQ requires maxRetriesPerRequest: null on worker connections.
  const connection = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });

  const matchWorker = new Worker<MatchTransactionJob>(
    QUEUES.matchTransaction,
    (job) => processMatchTransaction({ prisma, log }, job.data),
    { connection, concurrency: 5 },
  );
  const overdueWorker = new Worker(
    QUEUES.overdueInvoices,
    async () => {
      const count = await processOverdueInvoices(prisma);
      log.info({ count }, 'marked invoices overdue');
      return count;
    },
    { connection },
  );
  const workers = [matchWorker, overdueWorker];
  for (const w of workers) {
    w.on('failed', (job, err) => logIfExhausted(log, job, err));
    w.on('error', (err) => log.error({ err: err.message }, 'worker error'));
  }

  const overdueQueue = new Queue(QUEUES.overdueInvoices, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  await overdueQueue.upsertJobScheduler(
    'overdue-invoices-hourly',
    { pattern: '0 * * * *', tz: 'UTC' },
    { name: 'overdue-invoices', opts: DEFAULT_JOB_OPTIONS },
  );

  return {
    close: async () => {
      await Promise.all(workers.map((w) => w.close())); // waits for in-flight jobs
      await overdueQueue.close();
      connection.disconnect();
    },
  };
}
