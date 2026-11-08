import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPrismaClient, type PrismaClient } from '../src/client.js';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

export interface TestDatabase {
  prisma: PrismaClient;
  url: string;
  stop: () => Promise<void>;
}

/** Start a throwaway Postgres, apply all migrations, and return a client. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();
  const url = container.getConnectionUri();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const prisma = createPrismaClient(url);
  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
