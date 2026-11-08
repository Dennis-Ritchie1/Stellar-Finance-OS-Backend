# AGENTS.md — rules for AI coding agents

Read `README.md` first. These rules are non-negotiable.

1. **Never** add code that stores, logs, or accepts a Stellar secret key (`S...`). Transactions are built unsigned and signed client-side.
2. All amounts are strings or `Decimal`. Any `parseFloat`/`Number()` on an amount is a bug.
3. Every DB query on business data must filter by `organizationId`. Add a test for cross-org access on every new route.
4. `packages/matching` stays pure — no Prisma, no network calls.
5. Every API route has a Zod schema for input and output so OpenAPI stays accurate.
6. Indexer writes must be idempotent (upsert on `txHash + operationIndex`).
7. Run `pnpm lint && pnpm typecheck && pnpm test` before declaring a task done.
8. Testnet only, until a human explicitly changes `STELLAR_NETWORK`.
