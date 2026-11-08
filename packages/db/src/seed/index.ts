import { assertNetworkAllowed, loadEnv } from '@finance-os/config';
import { createPrismaClient } from '../client.js';
import { DEMO_PASSWORD, DEMO_USERS } from './data.js';
import { seedDemo } from './seed-demo.js';

const env = await loadEnv();
assertNetworkAllowed(env);
if (env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data with NODE_ENV=production');
}

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const result = await seedDemo(prisma, process.env);
  if (result.status === 'skipped') {
    console.log(`Demo org already exists (${result.organizationId}) — nothing to do.`);
    console.log('Run `pnpm db:reset` to start from scratch.');
  } else {
    console.log(`Created demo org ${result.organizationId}`);
    console.log(`Treasury account: ${result.treasuryAddress}`);
    if (result.generatedTreasury) {
      console.log('  (random receive-only address — set SEED_TREASURY_ADDRESS to use your own)');
    }
    console.log(
      `Logins (password "${DEMO_PASSWORD}"): ${DEMO_USERS.map((u) => u.email).join(', ')}`,
    );
  }
} finally {
  await prisma.$disconnect();
}
