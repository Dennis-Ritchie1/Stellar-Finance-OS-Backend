import { assertNetworkAllowed, loadEnv } from '@finance-os/config';
import { createPrismaClient } from '@finance-os/db';
import { QUEUES } from '@finance-os/shared';
import { runUntilSignal } from './lifecycle.js';
import { createLogger } from './logger.js';
import { startRuntime } from './runtime.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

const prisma = createPrismaClient(env.DATABASE_URL);
const runtime = await startRuntime({ redisUrl: env.REDIS_URL, prisma, log });
log.info({ queues: Object.values(QUEUES) }, 'worker ready');

runUntilSignal(log, async () => {
  await runtime.close();
  await prisma.$disconnect();
});
