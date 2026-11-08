import { findEnvFile } from '@finance-os/config';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The .env lives at the monorepo root, not in this package.
const envFile = findEnvFile();
if (envFile) config({ path: envFile, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/index.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
