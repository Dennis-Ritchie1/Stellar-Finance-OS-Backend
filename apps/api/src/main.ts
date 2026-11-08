import { assertNetworkAllowed, loadEnv } from '@finance-os/config';
import { loggerOptions } from './logger.js';
import { buildServer } from './server.js';

const env = await loadEnv();
assertNetworkAllowed(env);

const app = await buildServer({
  logger: loggerOptions(env.LOG_LEVEL, env.NODE_ENV === 'development'),
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
app.log.info({ network: env.STELLAR_NETWORK }, 'api ready');
