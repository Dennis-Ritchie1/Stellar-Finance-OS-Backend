import { assertNetworkAllowed, getAssets, getNetworkConfig, loadEnv } from '@finance-os/config';
import { createPrismaClient } from '@finance-os/db';
import { HorizonClient } from '@finance-os/stellar';
import { loggerOptions } from './logger.js';
import { buildServer } from './server.js';

const env = await loadEnv();
assertNetworkAllowed(env);

const prisma = createPrismaClient(env.DATABASE_URL);
const { passphrase } = getNetworkConfig(env.STELLAR_NETWORK);
const app = await buildServer(
  {
    prisma,
    stellar: {
      network: env.STELLAR_NETWORK,
      networkPassphrase: passphrase,
      assets: getAssets(env.STELLAR_NETWORK, { usdcIssuer: env.USDC_ISSUER || undefined }),
      gateway: new HorizonClient(env.HORIZON_URL, passphrase),
    },
  },
  {
    logger: loggerOptions(env.LOG_LEVEL, env.NODE_ENV === 'development'),
  },
);
app.addHook('onClose', () => prisma.$disconnect());

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
app.log.info({ network: env.STELLAR_NETWORK }, 'api ready');
