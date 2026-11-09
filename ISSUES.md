# Open issues — Stellar Finance OS Backend

Ten scoped, high-impact issues that take the backend from "foundations done" to a working MVP.
Each one maps to the build order in [README §12](./README.md#12-build-order--status) and names the
files it touches. They are ordered roughly by dependency: do them top to bottom, or pick any whose
"Depends on" list is already done.

Every issue inherits these acceptance criteria from [`AGENTS.md`](./AGENTS.md), which are not repeated
below:

- No code stores, logs, or accepts a Stellar secret key (`S...`). Transactions are built unsigned.
- Amounts are strings or `Decimal` end to end — no `parseFloat` / `Number()` on an amount.
- Every business query filters by `organizationId`; every new org route is added to
  `apps/api/test/cross-org.test.ts`.
- Every route has Zod input **and** output schemas, so `/openapi.json` stays accurate.
- `pnpm check` (format:check + lint + typecheck + test) passes.
- Testnet only.

| # | Title | Area | Size | Depends on |
|---|---|---|---|---|
| 1 | [Implement the pure payment-matching engine](#1-implement-the-pure-payment-matching-engine) | `packages/matching` | M | — |
| 2 | [Wire the indexer: stream payments with cursor persistence and backfill](#2-wire-the-indexer-stream-payments-with-cursor-persistence-and-backfill) | `apps/indexer` | L | — |
| 3 | [Worker: `match-transaction` and `overdue-invoices` jobs](#3-worker-match-transaction-and-overdue-invoices-jobs) | `apps/worker` | M | 1, 2 |
| 4 | [Clients and vendors CRUD routes](#4-clients-and-vendors-crud-routes) | `apps/api` | S | — |
| 5 | [Invoice lifecycle routes + public payment page](#5-invoice-lifecycle-routes--public-payment-page) | `apps/api` | L | 4 |
| 6 | [Approval policies and payment-request approval workflow](#6-approval-policies-and-payment-request-approval-workflow) | `apps/api` | L | 4 |
| 7 | [Build unsigned XDR, verify signed XDR, submit, and settle payment requests](#7-build-unsigned-xdr-verify-signed-xdr-submit-and-settle-payment-requests) | `apps/api`, `apps/worker` | M | 6 |
| 8 | [Transactions API, manual matching, dashboard and treasury report](#8-transactions-api-manual-matching-dashboard-and-treasury-report) | `apps/api` | M | 1, 5 |
| 9 | [CSV reconciliation export](#9-csv-reconciliation-export) | `apps/api`, `apps/worker` | M | 3, 8 |
| 10 | [Production hardening: CORS, rate limiting, readiness, session cleanup](#10-production-hardening-cors-rate-limiting-readiness-session-cleanup) | `apps/api` | S | — |

Labels used below: `area:*`, `type:feature` / `type:security` / `type:infra`, `priority:p0` (blocks MVP) /
`priority:p1` (needed for pilot) / `priority:p2` (important, not blocking).

---

## 1. Implement the pure payment-matching engine

**Labels:** `area:matching` `type:feature` `priority:p0` · **Build order:** task 7

### Description

Matching incoming payments to invoices is the core of the product (README §5), but
`packages/matching` currently exports only the `MatchResult` type
(`packages/matching/src/types.ts`). Nothing can mark an invoice paid until this exists.

The engine must be a **pure function** — no Prisma, no network, no clock reads (pass `now` in) — so it
can be exhaustively table-tested and reused by the worker (issue 3) and the manual-match route
(issue 8). ESLint already blocks Prisma imports in this package (AGENTS.md rule 4).

Deterministic references already exist and should be reused rather than re-implemented:

- Muxed id → `Invoice.paymentRefId` (the indexer stores `Transaction.muxedId` as a decimal string).
- Memo → `parseInvoiceMemo()` in `packages/stellar/src/memo/invoice-memo.ts` (`INV42` → `42n`).
  If importing `@finance-os/stellar` would pull the SDK into this package, move `parseInvoiceMemo` to
  `@finance-os/shared` instead — it's pure string parsing.
- Amount comparison and arithmetic → `packages/shared/src/money`.

### Tasks

- [ ] Define input types in `packages/matching/src/types.ts`:
  - `MatchableTransaction` — `{ id, direction, assetCode, assetIssuer?, amount, memo?, memoType, muxedId?, from, createdAt }`
  - `OpenInvoice` — `{ id, clientId, paymentRefId: string, assetCode, assetIssuer?, amount, amountPaid, status, dueDate }`
  - `ClientHistory` — `Record<clientId, { knownAddresses: string[] }>`
- [ ] Extend `MatchResult`:
  - `matched` gains `appliedAmount` (amount credited to the invoice), `remaining` (invoice balance after)
    and `newStatus` (`partially_paid | paid`).
  - Add an `overpaidBy` field on `matched` (or a separate `flagged` reason that still carries the invoice id)
    so overpayments are both applied **and** flagged — decide and document which.
- [ ] Implement `matchTransaction(tx, openInvoices, history, opts)` in `src/match.ts`, in priority order:
  1. `direction !== 'in'` → `unmatched`.
  2. `muxedId` present → look up invoice by `paymentRefId`; method `muxed`, confidence `1`.
  3. Memo parses via `parseInvoiceMemo` → look up by `paymentRefId`; method `memo`, confidence `1`.
  4. Reference present but no open invoice has it (voided, paid, unknown) → `flagged: unknown_reference`.
  5. Reference found but asset code/issuer differ → `flagged: wrong_asset` (never matched).
  6. No reference → `suggested` with scored candidates: same asset (required), exact remaining
     amount, sender in client's `knownAddresses`, `createdAt` within a configurable window of
     `dueDate`. Sort by score desc, cap at 5. Return `unmatched` when there are none.
- [ ] Partial payments: `amountPaid + amount < amount` → `newStatus: 'partially_paid'`.
- [ ] Exact or over payment → `newStatus: 'paid'`; over → record `overpaidBy`.
- [ ] Ignore invoices in `draft` or `void` for deterministic matches (flag as `unknown_reference`).
- [ ] Export everything from `src/index.ts`; update `packages/matching/README.md` with the algorithm.

### Acceptance criteria

- [ ] Table-driven Vitest suite in `src/match.test.ts` covers, at minimum: muxed exact, memo exact,
      memo with lowercase/whitespace, partial, second partial completing the invoice, overpayment,
      wrong asset code, wrong issuer same code, reference to a voided invoice, reference to an unknown
      id, outgoing transaction, no reference with one strong candidate, no reference with no candidates,
      and muxed id taking priority over a conflicting memo.
- [ ] Suggestions are **never** returned as `matched` (README §5 rule).
- [ ] All amount math uses `@finance-os/shared` money helpers; a grep for `Number(`/`parseFloat` in the
      package returns nothing.
- [ ] Package has no runtime dependency on `@finance-os/db` or any network library.
- [ ] README build-order task 7 marked ✅.

---

## 2. Wire the indexer: stream payments with cursor persistence and backfill

**Labels:** `area:indexer` `type:feature` `priority:p0` · **Build order:** task 8

### Description

`apps/indexer/src/main.ts` logs `indexer ready (idle)` and does nothing; `backfill.ts` parses
arguments and logs `backfill not implemented yet`. The hard parts already exist in
`packages/stellar`: `HorizonPaymentSource.stream()` serialises records and stops on the first
failure so the cursor never skips a gap, and `page()` supports backfill. This issue connects them to
the database and the job queue.

Correctness requirements: **no gaps, no duplicates**, survive restarts, and pick up treasury accounts
added through the API without a restart.

### Tasks

- [ ] Add `@finance-os/db`, `@finance-os/stellar`, `bullmq` and `ioredis` to `apps/indexer`.
- [ ] `src/persist.ts` — `persistPayment(prisma, account, payment)`:
  - Determine `direction`: `in` if `baseAccountOf(payment.to) === account.stellarAddress`, else `out`.
    (A self-payment should produce one `in` row — document the choice.)
  - In a single DB transaction: `upsert` the `Transaction` on `txHash_operationIndex` (AGENTS.md
    rule 6), copy `organizationId` / `treasuryAccountId` from the account, then set
    `TreasuryAccount.indexerCursor = payment.pagingToken` **only if** it is greater than the current one.
  - After commit, enqueue `match-transaction` with `jobId = "${txHash}:${operationIndex}"` so a
    re-delivered payment can't create a duplicate job.
- [ ] `src/supervisor.ts` — one stream per `TreasuryAccount` on the configured network:
  - Load accounts on start; poll every 30 s (configurable) to start streams for new accounts and stop
    streams for deleted ones.
  - On stream error, restart from the last persisted cursor with exponential backoff (cap 60 s) and log
    the error with the account id.
- [ ] `main.ts`: start the supervisor; on SIGTERM stop all streams, drain in-flight writes, close
      Prisma and Redis (extend `runUntilSignal`'s `onStop`).
- [ ] `backfill.ts`: loop `source.page(account, cursor)` until `nextCursor === null`, persisting every
      payment through the same `persistPayment`. Support `--from ledger:<n>` by resolving the ledger to a
      paging token. Print progress every page.
- [ ] Add `INDEXER_POLL_INTERVAL_MS` to `EnvSchema` with a default.

### Acceptance criteria

- [ ] Integration test (Testcontainers Postgres + a fake `PaymentSource`): the same payment delivered
      twice produces exactly one `Transaction` row and one queued job.
- [ ] Integration test: a failure while persisting payment N leaves the cursor at N-1; restarting
      processes N and N+1 with no gap.
- [ ] Integration test: an account created after the supervisor starts begins streaming within one
      poll interval.
- [ ] Muxed payments store `muxedId` and are classified as `in`.
- [ ] Manual check on testnet: sending a payment to a seeded treasury account creates a `Transaction`
      within a few seconds (README build-order "done when").
- [ ] `backfill` against a testnet account with >200 payments imports all of them; running it twice
      creates no duplicates.
- [ ] Indexer README documents restart semantics and the backfill command.

---

## 3. Worker: `match-transaction` and `overdue-invoices` jobs

**Labels:** `area:worker` `type:feature` `priority:p0` · **Build order:** task 9 · **Depends on:** 1, 2

### Description

`apps/worker` currently only declares queue names (`src/queues.ts`). This issue adds the BullMQ
processors that turn indexed transactions into invoice status changes, and that mark overdue
invoices. After it lands, the end-to-end flow "pay an invoice on testnet → invoice becomes `paid`"
works.

### Tasks

- [ ] Add `bullmq`, `ioredis`, `@finance-os/db`, `@finance-os/matching` to `apps/worker`.
- [ ] Move queue names and job payload types to a shared place both producers and consumers import
      (e.g. `packages/shared/src/queues.ts`) so the indexer (issue 2) and API don't import from an app.
- [ ] `match-transaction` processor (`src/jobs/match-transaction.ts`), payload `{ transactionId }`:
  - Load the transaction; skip if it already has a `PaymentMatch` (idempotent re-runs).
  - If `direction === 'out'` and `txHash` equals a `PaymentRequest.txHash` → hand off to settlement
    (issue 7) and return.
  - Load the org's open invoices on that treasury account plus client `knownAddresses`; call
    `matchTransaction` from `@finance-os/matching`.
  - On `matched`: in one DB transaction create `PaymentMatch`, increment `Invoice.amountPaid` with a
    `Decimal` increment, set `status`/`paidAt`, and add `tx.from` to the client's `knownAddresses`.
    Lock the invoice row (`SELECT … FOR UPDATE`) so two concurrent partial payments can't both read
    the old `amountPaid`.
  - On `suggested` / `flagged`: persist the outcome so the UI can list it (add a nullable
    `matchStatus` + `matchNote` on `Transaction`, or a small `MatchSuggestion` table — include the
    migration).
- [ ] `overdue-invoices` processor: repeatable job (hourly) that sets `status = 'overdue'` for invoices
      in `sent`/`partially_paid` whose `dueDate` is before today (UTC). Must be a single set-based
      `updateMany`, not a loop.
- [ ] Configure retries with exponential backoff and a dead-letter log line for exhausted jobs.
- [ ] Graceful shutdown: close workers (finishing in-flight jobs) before exiting.

### Acceptance criteria

- [ ] Integration test: a `Transaction` with a matching muxed id moves its invoice `sent → paid` and
      creates one `PaymentMatch` with method `muxed`, confidence `1`.
- [ ] Integration test: two partial payments processed concurrently leave `amountPaid` equal to their
      exact sum.
- [ ] Integration test: running the same job twice creates one `PaymentMatch`.
- [ ] Integration test: a wrong-asset payment leaves the invoice untouched and is recorded as flagged.
- [ ] Integration test: overdue job marks only past-due `sent`/`partially_paid` invoices; `paid`,
      `void`, `draft` are untouched.
- [ ] Manual testnet run: pay a seeded invoice's muxed address → invoice is `paid` (build-order 9 "done when").

---

## 4. Clients and vendors CRUD routes

**Labels:** `area:api` `type:feature` `priority:p0` · **Build order:** task 5 (part)

### Description

Clients and vendors are prerequisites for invoices and payment requests. The schema, permissions
(`clients:write`, `vendors:write`) and seed data exist, but there are no routes. Treasury accounts
(`apps/api/src/routes/treasury-accounts.ts`) are the reference implementation to copy: `findOwned`
scoped by `organizationId`, `requireOrgPermission`, DTO mappers, `errorResponses`, and FK-violation →
409 on delete.

### Tasks

- [ ] `apps/api/src/routes/clients.ts`:
  - `GET /orgs/:orgId/clients` (keyset pagination via `lib/pagination.ts`, optional `q` name search),
    `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` (409 if invoices reference it).
  - Read requires `org:read`; writes require `clients:write`.
  - `knownAddresses` is read-only through the API (maintained by matching).
- [ ] `apps/api/src/routes/vendors.ts`: same shape with `vendors:write`.
  - `stellarAddress` accepts `G...` or `M...` (validate with `packages/stellar/src/address/validate.ts`).
  - `memoRequired: true` requires `memo` + `memoType`; validate the memo with the existing memo helpers
    (text ≤ 28 bytes, id is a uint64 string, hash is 32 bytes hex). Reject `memoRequired` with an
    `M...` address (muxed already carries the id) or document why it's allowed.
  - Reject secret keys in any field (the global secret guard already runs; add a test that proves it).
- [ ] Register both in `routes/v1.ts`; add every new route to `test/cross-org.test.ts`.

### Acceptance criteria

- [ ] Integration tests for each route covering 200/201/204, 400 (validation), 401, 403 (viewer
      writing), 404 (other org's id), 409 (delete in use).
- [ ] Cross-org test covers all ten new routes.
- [ ] `/openapi.json` shows both resources with request and response schemas (`test/openapi.test.ts`
      still passes).
- [ ] Vendor with an exchange-style memo round-trips exactly (memo type and value preserved).

---

## 5. Invoice lifecycle routes + public payment page

**Labels:** `area:api` `type:feature` `priority:p0` · **Build order:** task 5 (part) · **Depends on:** 4

### Description

Invoices are the receivable half of the product. Each invoice must get a **unique payment reference**
on creation — a muxed `M...` address derived from the treasury account + `paymentRefId`, and a memo
fallback `INV<paymentRefId>` — so that issue 1 can match payments deterministically. The schema
already has `paymentRefId` (autoincrement, globally unique), `muxedAddress`, `memo`, and
`publicToken`; `deriveMuxedAddress` and `invoiceMemo` exist in `packages/stellar`.

### Tasks

- [ ] `apps/api/src/routes/invoices.ts`:
  - `POST /orgs/:orgId/invoices` — body: `clientId`, `treasuryAccountId`, `assetCode` (must be in
    `app.stellar.assets`), `dueDate`, `notes?`, `lineItems[]` (`description`, `quantity`, `unitPrice`).
    Server computes each line `amount` and the invoice total with Decimal math; client never sends totals.
    Generate `number` as `INV-<year>-<seq>` per org (handle the race with the `(organizationId, number)`
    unique constraint and retry), and `publicToken` with `packages/shared/src/crypto/token.ts`.
  - Within one DB transaction: create the invoice, read back `paymentRefId`, then set
    `muxedAddress = deriveMuxedAddress(treasury.stellarAddress, paymentRefId)` and
    `memo = invoiceMemo(paymentRefId)`.
  - Verify `clientId` and `treasuryAccountId` belong to the same org (404 otherwise — not 400, to avoid
    leaking existence).
  - `GET` list with filters `status`, `clientId`, `overdue=true`; keyset pagination.
  - `GET /:id` including line items and matches.
  - `PATCH /:id` — only while `draft`; recompute totals when line items change.
  - `DELETE /:id` — only while `draft`.
  - `POST /:id/send` — `draft → sent`, sets `sentAt`. Enqueue `send-email` if the client has an email
    (job body only; email delivery is out of scope).
  - `POST /:id/void` — allowed from `draft | sent | overdue`; 409 if any payment is matched.
  - All status transitions use a conditional `updateMany({ where: { id, organizationId, status: { in: [...] } } })`
    so concurrent requests can't double-transition.
- [ ] `apps/api/src/routes/public-invoices.ts`: `GET /v1/public/invoices/:publicToken` (no auth)
      returning only what a payer needs — org name, invoice number, line items, amount due, asset
      (code + issuer), `muxedAddress`, `memo`, due date, status. Never return internal ids,
      `organizationId`, or client email. Return 404 for `draft` invoices.
- [ ] Shared `InvoiceStatus` transition table in `packages/shared` with unit tests.

### Acceptance criteria

- [ ] Creating an invoice returns a valid `M...` address whose decoded base is the treasury account and
      whose id is the invoice's `paymentRefId` (round-trip with `decodeMuxedAddress`).
- [ ] Totals: line items `3 × 33.3333333` produce exactly `99.9999999` (no float drift).
- [ ] Invalid transitions (`send` on `paid`, `void` with matches, `PATCH` on `sent`) return 409.
- [ ] Public endpoint returns 404 for unknown tokens and draft invoices, and its response schema
      contains no `organizationId`/`clientId`/email fields (asserted in a test).
- [ ] Cross-org tests cover every org route; an invoice can't reference another org's client or account.
- [ ] Seeded demo invoices (`pnpm db:seed`) are listable and render on the public endpoint.

---

## 6. Approval policies and payment-request approval workflow

**Labels:** `area:api` `type:feature` `priority:p0` · **Build order:** task 10 (part) · **Depends on:** 4

### Description

Outgoing payments require off-chain M-of-N approval (README §7). The schema has `ApprovalPolicy`
(`threshold`, `amountAbove`, `assetCode`, approvers via `ApprovalPolicyApprover`), `PaymentRequest`
and `Approval` (unique per request+member). This issue adds the routes and — most importantly — the
**policy resolution** logic that decides how many approvals a given request needs, as a pure,
unit-tested function.

### Tasks

- [ ] Pure function `requiredApproval(request, policies) → { threshold, approverMemberIds } | null` in
      `packages/shared` (or a new `apps/api/src/approvals/policy.ts`):
  - A policy applies if `assetCode` is null or equals the request's asset, and `amountAbove` is null
    or `request.amount > amountAbove` (Decimal comparison).
  - If several apply, the **strictest** wins (highest threshold); document the tie-break.
  - If none apply, fall back to a safe default (threshold 1, any member with `payment_requests:approve`).
- [ ] `apps/api/src/routes/approval-policies.ts`: CRUD under `approval_policies:manage`. Validate
      `1 ≤ threshold ≤ approvers.length`, approvers are members of the same org and have a role that
      holds `payment_requests:approve`.
- [ ] `apps/api/src/routes/payment-requests.ts`:
  - CRUD under `payment_requests:create`; `vendorId` and `sourceTreasuryAccountId` must be same-org;
    asset must be configured on the network.
  - `POST /:id/submit-for-approval` — `draft → pending_approval`.
  - `POST /:id/approve` and `/reject` (body `{ comment? }`) under `payment_requests:approve`:
    - Caller must be an eligible approver for the resolved policy (403 otherwise).
    - **The creator cannot approve their own request** (separation of duties).
    - Insert `Approval`; a duplicate vote returns 409 (unique constraint).
    - Any reject → `rejected`. Approvals reaching threshold → `approved`.
    - Do the count-and-transition inside a transaction with the request row locked, so two
      simultaneous final approvals can't both fire side effects.
  - Editing a request after any approval exists is forbidden (409) — otherwise approved amounts could change.
- [ ] Register routes; add them to the cross-org test.

### Acceptance criteria

- [ ] Unit tests for policy resolution: no policies, asset-specific policy, `amountAbove` boundary
      (equal is **not** above), overlapping policies.
- [ ] Integration test: 2-of-3 policy — first approval keeps `pending_approval`, second moves to
      `approved`, third returns 409 (already decided).
- [ ] Integration test: creator approving own request → 403; viewer/accountant approving → 403;
      non-listed approver → 403.
- [ ] Integration test: concurrent final approvals result in exactly one transition.
- [ ] Integration test: `PATCH` after an approval → 409.

---

## 7. Build unsigned XDR, verify signed XDR, submit, and settle payment requests

**Labels:** `area:api` `area:worker` `type:feature` `type:security` `priority:p0` · **Build order:** task 10 (part) · **Depends on:** 6

### Description

Approved payment requests must become on-chain payments **without the backend ever holding a secret
key** (AGENTS.md rule 1). The building blocks exist and are tested: `buildPaymentTransaction`
(`packages/stellar/src/tx/build-payment.ts`) and `verifySignedPayment` (`verify-payment.ts`), plus
`StellarGateway.loadSequence/submit` in `apps/api/src/plugins/stellar.ts`. This issue exposes them
as routes and closes the loop when the indexer sees the payment.

The critical security property (README §7): **an approval must never be bypassable by swapping the
transaction.** The submitted XDR must be the exact transaction that was built for the approved request.

### Tasks

- [ ] Migration: add `unsignedTxHash String?` to `PaymentRequest` (the hash is what
      `verifySignedPayment`'s `expectedHash` compares against).
- [ ] `POST /orgs/:orgId/payment-requests/:id/build-tx` (`payment_requests:submit`):
  - Only from `approved`.
  - Build the `PaymentIntent` from DB values (never from the request body): source = treasury
    address, destination = vendor address, asset, amount, memo from vendor if `memoRequired`.
  - `loadSequence` via the gateway; store `unsignedXdr` + `unsignedTxHash`; return both plus the
    network passphrase.
  - Rebuilding is allowed (e.g. after the 15-minute timeout) and overwrites the stored XDR.
- [ ] `POST /orgs/:orgId/payment-requests/:id/submit` (`payment_requests:submit`), body `{ signedXdr }`:
  - Only from `approved` with a stored `unsignedTxHash`.
  - `verifySignedPayment(signedXdr, intent, { networkPassphrase, expectedHash })`; on failure return
    422 with the `errors[]` list and do **not** submit.
  - Conditionally transition `approved → submitted` **before** calling the network (so two submits
    can't both go out), store `txHash` + `submittedAt`, then `gateway.submit`.
  - On a definite Horizon rejection: `failed` with `failureReason` (decoded result codes). On timeout /
    unknown outcome: stay `submitted` — the indexer is the source of truth.
- [ ] Settlement in the worker (hook from issue 3): an outgoing `Transaction` whose `txHash` equals a
      `PaymentRequest.txHash` → create `PaymentMatch` (`paymentRequestId`, method `manual` or a new
      `tx_hash` method — decide and document), set `settled` + `settledAt`.
- [ ] Support multisig treasuries: pass `allowedSigners` loaded from Horizon account signers (can be a
      follow-up if scoped out — note it in the PR).

### Acceptance criteria

- [ ] Integration tests (with `test/fake-stellar.ts`) reject each tampering case with 422 and leave the
      status `approved`: different destination, amount, asset, memo, source, extra operation, unsigned,
      signed for another network, fee-bump wrapper, valid tx built for a *different* request.
      (README build-order 10 "done when": tampered XDR is rejected.)
- [ ] Happy path: build → sign with a test keypair in the test → submit → `submitted` with `txHash`.
- [ ] Two concurrent submits produce exactly one `gateway.submit` call.
- [ ] `build-tx` on a `pending_approval` or `rejected` request → 409.
- [ ] The request body schema for `submit` contains only `signedXdr`; no route accepts an `S...` value
      (the secret guard test covers the new routes).
- [ ] Worker test: indexed outgoing transaction settles the matching request.

---

## 8. Transactions API, manual matching, dashboard and treasury report

**Labels:** `area:api` `type:feature` `priority:p1` · **Build order:** task 11 · **Depends on:** 1, 5

### Description

Accountants need to see what landed on-chain, resolve what automatic matching couldn't, and get a
treasury overview. This issue adds the read APIs and the manual-match fallback (README §5, step 5).

### Tasks

- [ ] `GET /orgs/:orgId/transactions` with filters `direction`, `status`, `treasuryAccountId`,
      `unmatched=true`, `from`/`to` date range; keyset pagination; include match summary and any
      suggestion from issue 3.
- [ ] `GET /orgs/:orgId/transactions/:id` with matches and candidate suggestions (re-run the pure
      engine on read if suggestions aren't persisted).
- [ ] `POST /orgs/:orgId/transactions/:id/match` (`transactions:match`), body
      `{ invoiceId, amount? }`:
  - Same-org invoice; asset must match (409 otherwise); amount defaults to the unallocated remainder
    of the transaction and may not exceed it.
  - Creates a `PaymentMatch` with method `manual`, confidence `1`, `matchedByMemberId`; updates the
    invoice exactly like the worker (extract that logic into one shared function — don't duplicate it).
- [ ] `DELETE /orgs/:orgId/transactions/:id/matches/:matchId` — undo a manual match and roll back the
      invoice's `amountPaid`/status.
- [ ] `GET /orgs/:orgId/dashboard`: live balances per treasury account (`gateway.getBalances`, with a
      short in-memory cache and graceful degradation if Horizon is down), 30-day inflow/outflow totals
      per asset, count and sum of open invoices, overdue count, pending approvals count.
- [ ] `GET /orgs/:orgId/reports/treasury?from=&to=&interval=day|week|month`: inflow, outflow and net per
      asset per bucket, computed with SQL `SUM` on `Decimal` (no JS summation of floats).

### Acceptance criteria

- [ ] Dashboard and report numbers equal hand-computed totals from the seed data (build-order 11
      "done when") — asserted in an integration test.
- [ ] Manual match then undo returns the invoice to its exact previous `amountPaid` and status.
- [ ] Over-allocating a transaction across two invoices → 409.
- [ ] Viewer can read transactions/dashboard but gets 403 on match.
- [ ] Dashboard still returns 200 (balances marked unavailable) when the gateway throws.
- [ ] All amounts in responses are strings with up to 7 decimals.

---

## 9. CSV reconciliation export

**Labels:** `area:api` `area:worker` `type:feature` `priority:p1` · **Build order:** task 12 · **Depends on:** 3, 8

### Description

Businesses reconcile in QuickBooks/Xero, so the MVP deliverable is a CSV export (README §1). The
`Export` model and `generate-report` queue name exist; nothing generates files.

### Tasks

- [ ] `POST /orgs/:orgId/exports` (`exports:create`), body
      `{ format: "csv", type: "reconciliation", from, to }` → creates `Export(pending)`, enqueues
      `generate-report`, returns 202 with the export.
- [ ] `GET /orgs/:orgId/exports` (list) and `GET /:id` (status).
- [ ] `GET /orgs/:orgId/exports/:id/download` — streams the file with
      `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment`; 409 while pending.
- [ ] Storage abstraction `ExportStorage { put(key, stream), get(key) }` with a local-filesystem
      implementation (`EXPORT_DIR` env var); S3-compatible implementation can follow.
- [ ] Worker `generate-report` processor: stream rows from Postgres (cursor/batched, not one giant
      `findMany`) into the CSV; set `ready`, `rowCount`, `fileKey`, `completedAt`, or `failed`.
- [ ] Columns (document in the README): `Date, Direction, Counterparty, Stellar Address, Asset, Amount,
      Memo, Tx Hash, Invoice Number, Payment Request, Match Method, Status`.
- [ ] CSV safety: RFC 4180 quoting, UTF-8 BOM for Excel, and **formula-injection protection** — prefix
      cells starting with `=`, `+`, `-`, `@`, tab or CR with `'` (memos and names are user-controlled).

### Acceptance criteria

- [ ] Unit tests for the CSV encoder: commas, quotes, newlines, unicode, and each injection prefix.
- [ ] Integration test: seeded data exported for a date range has the expected row count and the
      amounts match `Transaction.amount` exactly as strings.
- [ ] Downloading another org's export id → 404.
- [ ] Generated file opens cleanly in Excel and Google Sheets (attach screenshots to the PR).
- [ ] A 100k-row export completes without loading all rows into memory (assert with a batched-reader
      unit test or measure in the PR).

---

## 10. Production hardening: CORS, rate limiting, readiness, session cleanup

**Labels:** `area:api` `type:security` `type:infra` `priority:p1`

### Description

The API is functionally solid but missing standard protections that must exist before any pilot:

- **No CORS** — `WEB_APP_URL` is configured but unused, so the browser frontend can't call the API
  (or, if CORS is added naively, any origin could).
- **No rate limiting** — `/v1/auth/login` and `/v1/auth/register` can be brute-forced; argon2id makes
  each attempt expensive for the server too, so this is also a DoS vector.
- **`/health` is liveness only** — it doesn't tell an orchestrator whether Postgres, Redis and Horizon
  are reachable.
- **Expired sessions are never deleted** and there's no way to revoke all sessions after a password
  change.
- `JWT_SECRET` is required but unused (sessions are opaque tokens) — confusing for operators.

### Tasks

- [ ] Add `@fastify/cors` allowing only `WEB_APP_URL` (support a comma-separated list), with
      `Authorization` in allowed headers.
- [ ] Add `@fastify/rate-limit` backed by Redis: strict limits on `/v1/auth/login` and `/register`
      (e.g. 10/min per IP **and** per email), a generous global default for other routes. Return 429
      with the standard error shape from `plugins/error-handler.ts` and a `Retry-After` header.
- [ ] Add `@fastify/helmet` (or equivalent headers) and set `trustProxy` from an env var so rate limits
      key on the real client IP behind a load balancer.
- [ ] `GET /ready` — checks `SELECT 1`, Redis `PING` and (non-fatally) Horizon; returns 503 with which
      dependency failed. Keep `/health` as pure liveness.
- [ ] Session cleanup: a worker repeatable job deleting sessions expired/revoked more than 7 days ago,
      plus `POST /v1/auth/logout-all` revoking every session for the user.
- [ ] Either remove `JWT_SECRET` from `EnvSchema`/`.env.example`/README, or rename it to something it
      is actually used for. Don't leave a required-but-unused secret.
- [ ] Add a multi-stage `Dockerfile` per app (or one parametrised) and a `docker-compose.prod.yml`
      example; run as non-root.

### Acceptance criteria

- [ ] Test: a preflight from `WEB_APP_URL` succeeds; from another origin it gets no
      `Access-Control-Allow-Origin`.
- [ ] Test: the 11th login attempt within a minute returns 429 with `Retry-After`; other routes are
      unaffected.
- [ ] Test: `/ready` returns 503 when the database is stopped (Testcontainers) and 200 when it's up.
- [ ] Test: `logout-all` invalidates every token for that user and none for other users.
- [ ] `/health`, `/ready` and new error responses appear in `/openapi.json`.
- [ ] `docker build` succeeds for each app in CI (add a job) and containers start against
      docker-compose services.
