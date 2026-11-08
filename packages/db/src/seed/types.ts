import type { Prisma } from '../generated/prisma/client.js';

/** Seed steps run inside one interactive transaction. */
export type Tx = Prisma.TransactionClient;
