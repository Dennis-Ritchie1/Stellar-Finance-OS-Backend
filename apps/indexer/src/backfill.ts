import { assertNetworkAllowed, getNetworkConfig, loadEnv } from '@finance-os/config';
import { createPrismaClient } from '@finance-os/db';
import { HorizonClient, HorizonPaymentSource } from '@finance-os/stellar';
import { parseBackfillArgs } from './backfill-args.js';
import { runBackfill } from './backfill-run.js';
import { createLogger } from './logger.js';
import { createBullMatchQueue } from './queue.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const args = parseBackfillArgs(process.argv.slice(2));

const prisma = createPrismaClient(env.DATABASE_URL);
const queue = createBullMatchQueue(env.REDIS_URL);
const source = new HorizonPaymentSource(
  new HorizonClient(env.HORIZON_URL, getNetworkConfig(env.STELLAR_NETWORK).passphrase),
);

try {
  const result = await runBackfill({
    prisma,
    source,
    queue,
    network: env.STELLAR_NETWORK,
    log,
    address: args.account,
    from: args.from,
  });
  log.info(result, 'backfill complete');
} catch (err) {
  log.error({ err }, 'backfill failed');
  process.exitCode = 1;
} finally {
  await queue.close();
  await prisma.$disconnect();
}
