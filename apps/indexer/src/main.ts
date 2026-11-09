import { assertNetworkAllowed, getNetworkConfig, loadEnv } from '@finance-os/config';
import { createPrismaClient } from '@finance-os/db';
import { HorizonClient, HorizonPaymentSource } from '@finance-os/stellar';
import { runUntilSignal } from './lifecycle.js';
import { createLogger } from './logger.js';
import { createBullMatchQueue } from './queue.js';
import { Supervisor } from './supervisor.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

const prisma = createPrismaClient(env.DATABASE_URL);
const queue = createBullMatchQueue(env.REDIS_URL);
const source = new HorizonPaymentSource(
  new HorizonClient(env.HORIZON_URL, getNetworkConfig(env.STELLAR_NETWORK).passphrase),
);
const supervisor = new Supervisor({
  prisma,
  source,
  queue,
  network: env.STELLAR_NETWORK,
  log,
  pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
});

await supervisor.start();
log.info(
  {
    network: env.STELLAR_NETWORK,
    horizon: env.HORIZON_URL,
    accounts: supervisor.activeAccountIds.length,
  },
  'indexer running',
);

runUntilSignal(log, async () => {
  await supervisor.stop(); // stop streams, drain in-flight writes
  await queue.close();
  await prisma.$disconnect();
});
