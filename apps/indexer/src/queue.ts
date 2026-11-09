import { Queue } from 'bullmq';
import { QUEUES } from './queue-names.js';
import { Redis } from 'ioredis';

export interface MatchJob {
  transactionId: string;
  organizationId: string;
  txHash: string;
  operationIndex: number;
}

/** What the indexer needs from the job queue. */
export interface MatchQueue {
  enqueue(job: MatchJob): Promise<void>;
  close(): Promise<void>;
}

/**
 * Deterministic id: a re-delivered payment can never create a second job.
 * BullMQ rejects ':' in custom job ids, so the separator is '-' (txHash is hex,
 * so the pair stays unambiguous).
 */
export const matchJobId = (job: Pick<MatchJob, 'txHash' | 'operationIndex'>) =>
  `${job.txHash}-${job.operationIndex}`;

export function createBullMatchQueue(redisUrl: string): MatchQueue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<MatchJob>(QUEUES.matchTransaction, { connection });
  return {
    async enqueue(job) {
      await queue.add(QUEUES.matchTransaction, job, {
        jobId: matchJobId(job),
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      });
    },
    async close() {
      await queue.close();
      connection.disconnect();
    },
  };
}
