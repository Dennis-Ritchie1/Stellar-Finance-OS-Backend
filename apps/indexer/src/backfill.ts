import { loadEnv, assertNetworkAllowed } from '@finance-os/config';
import { parseBackfillArgs } from './backfill-args.js';
import { createLogger } from './logger.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const args = parseBackfillArgs(process.argv.slice(2));

// Task 8: page through history for args.account from args.from.
log.warn(args, 'backfill not implemented yet');
