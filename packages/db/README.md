# @finance-os/db

Prisma schema (README §4), migrations, demo seed and a typed client.

```bash
pnpm db:migrate     # apply migrations (prisma migrate dev)
pnpm db:seed        # create the demo org — safe to re-run
pnpm db:reset       # drop, re-migrate and re-seed
pnpm --filter @finance-os/db db:studio
```

```ts
import { createPrismaClient } from '@finance-os/db';
const prisma = createPrismaClient(env.DATABASE_URL);
```

## Conventions

- Every business table has `organizationId` — always filter by it (AGENTS.md #3).
- Money is `Decimal(38,7)`. Pass amounts as strings, never JS numbers.
- `transactions` is unique on `(txHash, operationIndex)` — the indexer's idempotency key.
- Invoices carry `paymentRefId` (the muxed id), `muxedAddress`, `memo` and `publicToken`.
- Database CHECKs enforce positive amounts, policy `threshold >= 1`, match `confidence` in 0..1,
  and exactly one target (invoice _or_ payment request) per `payment_matches` row.

## Tests

`test/*.test.ts` start a throwaway Postgres with Testcontainers (Docker required),
apply migrations and run against it.
