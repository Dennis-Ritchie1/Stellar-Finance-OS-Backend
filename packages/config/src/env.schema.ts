import { StellarNetworkSchema } from '@finance-os/shared';
import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_SECRET: z.string().min(8),

  STELLAR_NETWORK: StellarNetworkSchema.default('testnet'),
  HORIZON_URL: z.url(),
  STELLAR_RPC_URL: z.url(),
  USDC_ISSUER: z.string().optional(),
  CONTRACT_DEPLOYMENTS_PATH: z.string().optional(),

  WEB_APP_URL: z.url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Env = z.infer<typeof EnvSchema>;
