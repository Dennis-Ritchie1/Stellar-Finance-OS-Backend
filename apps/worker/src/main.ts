import { assertNetworkAllowed, loadEnv } from '@finance-os/config';
import { runUntilSignal } from './lifecycle.js';
import { createLogger } from './logger.js';
import { QUEUES } from './queues.js';

const env = await loadEnv();
assertNetworkAllowed(env);
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

// Task 9: BullMQ processors for each queue.
log.info({ queues: Object.values(QUEUES) }, 'worker ready (idle)');

runUntilSignal(log);
