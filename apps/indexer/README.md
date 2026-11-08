# @finance-os/indexer

Long-running Stellar watcher. Streams payments per TreasuryAccount and writes Transactions idempotently.

```bash
pnpm --filter @finance-os/indexer dev
pnpm --filter @finance-os/indexer backfill --account G... --from <cursor|ledger>
```
