# @finance-os/indexer

Long-running Stellar watcher. Streams payments per TreasuryAccount and writes Transactions idempotently.

```bash
pnpm --filter @finance-os/indexer dev
pnpm --filter @finance-os/indexer backfill --account G... --from <cursor|ledger:N>
```

## How it works

- `supervisor.ts` runs one Horizon payment stream per `TreasuryAccount` on `STELLAR_NETWORK`. Every `INDEXER_POLL_INTERVAL_MS` (default 30 000) it re-reads the table: new accounts start streaming, deleted ones stop. No restart needed.
- `persist.ts` handles each payment: in **one DB transaction** it upserts the `Transaction` on `(txHash, operationIndex)` and advances `TreasuryAccount.indexerCursor` (numeric compare, never backwards). After commit it enqueues `match-transaction` with `jobId = "<txHash>-<operationIndex>"` (BullMQ forbids `:` in custom ids).
- Direction: `in` if the destination's base account (muxed or not) is the treasury account, otherwise `out`. A self-payment is stored once, as `in`. Muxed destinations keep `muxedId`. Failed on-chain operations are stored with `status = failed`.

## Restart semantics

- The cursor is only advanced inside the same transaction that writes the row, so a crash or error while persisting payment N leaves the cursor at N-1.
- A stream error (network drop, failed write) stops that account's stream; the supervisor reopens it **from the persisted cursor** with exponential backoff (1 s doubling, capped at 60 s). Payments are delivered serialised, so there is never a gap.
- Re-delivery is harmless: the upsert rewrites the same row and the deterministic jobId dedupes the job.
- A brand-new account (null cursor) streams from "now". Use `backfill` to import history.
- On SIGTERM/SIGINT the streams stop, in-flight writes finish, then the queue and Prisma close.
- Known limit: the job is enqueued after commit. If Redis is down at that moment the row exists but its job is lost; re-run `backfill` over that range to re-enqueue (the upsert is a no-op, the job is added).

## Backfill

```bash
pnpm --filter @finance-os/indexer backfill --account G... [--from <pagingToken>|ledger:<n>]
```

- The account must already exist as a TreasuryAccount on the configured network.
- Pages (200 per request) from `--from` (default: the beginning) until Horizon returns an empty page, persisting through the same `persistPayment`, and logs progress per page.
- `ledger:<n>` is converted to the paging token just before ledger n (`n << 32`).
- Safe to run repeatedly and alongside the live stream. It never moves the cursor backwards. Starting **after** the stored cursor can move the cursor over unindexed history, so prefer starting at or before it.
