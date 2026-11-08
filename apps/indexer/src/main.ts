import { assertNetworkAllowed, loadEnv } from '@finance-os/config';
import { runUntilSignal } from './lifecycle.js';
import { createLogger } from './logger.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

// Task 8: stream payments for every TreasuryAccount, resuming from indexerCursor.
log.info({ network: env.STELLAR_NETWORK, horizon: env.HORIZON_URL }, 'indexer ready (idle)');

runUntilSignal(log);
