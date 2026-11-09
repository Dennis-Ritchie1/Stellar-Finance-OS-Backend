# Stellar Finance OS — Backend

> Repo 2 of 3 · `finance-os-backend` · Node.js + TypeScript monorepo
> Sibling repos: [`finance-os-web`](../finance-os-web) (frontend) · [`finance-os-contracts`](../finance-os-contracts) (Soroban)

**Stellar Finance OS** is a treasury and accounts-receivable/payable system for businesses that get
paid and pay suppliers in stablecoins (e.g. USDC) on the [Stellar](https://stellar.org) network. It
does for on-chain money what an accounting back office does for a bank account: it issues invoices,
recognises which incoming payment settled which invoice, routes outgoing payments through an
approval workflow, and produces exports an accountant can reconcile in QuickBooks or Xero.

This repository is the backend. It owns the business data (organizations, members, invoices,
vendors, payment requests), watches Stellar for payments in and out of the business's accounts,
matches those payments to invoices, runs the approval workflow, builds the transactions to be
signed, and generates accounting exports.

**Stellar is the settlement layer. This repo is the business layer.**

**Non-custodial by design.** The backend never stores, receives, or uses a business's secret keys.
It builds _unsigned_ transactions (XDR); a person signs them in their own wallet in the browser, and
the backend verifies the signed transaction is exactly what was approved before submitting it.

---

## Contents

1. [The problem and the product](#1-the-problem-and-the-product)
2. [How it works — end to end](#2-how-it-works--end-to-end)
3. [Architecture](#3-architecture)
4. [Monorepo layout](#4-monorepo-layout)
5. [Tech stack](#5-tech-stack)
6. [Domain model](#6-domain-model)
7. [Payment matching](#7-payment-matching--the-core-of-the-product)
8. [The indexer](#8-the-indexer-appsindexer)
9. [Outgoing payments and approvals](#9-outgoing-payments--approvals)
10. [API](#10-api)
11. [Security model](#11-security-model)
12. [Build order & status](#12-build-order--status)
13. [Getting started](#13-getting-started)
14. [Configuration](#14-configuration)
15. [Testing and quality gate](#15-testing-and-quality-gate)
16. [Contributing](#16-contributing)
17. [Roadmap and open questions](#17-roadmap-and-open-questions)

---

## 1. The problem and the product

A business that accepts USDC on Stellar today usually shares one wallet address with every customer.
Money arrives, but nobody can say _which_ invoice it was for without chasing customers or eyeballing
amounts. Paying suppliers is worse: one person with the wallet can send anything, there is no
approval trail, and the books are rebuilt by hand from a block explorer at month end.

Stellar Finance OS fixes this with four ideas:

1. **Every invoice has its own payment address.** Using Stellar _muxed accounts_, each invoice gets
   a unique `M...` address that still deposits into the business's single treasury account. The
   embedded number tells us exactly which invoice was paid. A memo (`INV42`) is the fallback for
   wallets that don't support muxed addresses.
2. **The blockchain is watched, not trusted to people.** An indexer streams every payment touching
   the business's accounts into the database, and a matching engine links each one to its invoice
   and updates the status — `sent → partially_paid → paid`.
3. **Outgoing money needs approvals.** Paying a vendor starts as a _payment request_. It must be
   approved by M of N designated approvers before a transaction can even be built, and the signed
   transaction is checked field-by-field against what was approved.
4. **Accounting-ready output.** Everything is multi-tenant, auditable, and exportable as CSV in
   columns accounting tools understand.

### MVP scope

| Feature | Owned here | Notes |
|---|---|---|
| Business dashboard data | ✅ | Balances per treasury account, inflow/outflow totals |
| Invoice management | ✅ | Create, send, track, void; unique payment reference per invoice |
| Payment matching | ✅ | Auto-match incoming payments to invoices; manual match fallback |
| Vendor management | ✅ | Vendor records + Stellar payout addresses (with exchange memos) |
| Approval workflow | ✅ | Off-chain M-of-N approvals in MVP (on-chain in Phase 2 via contracts repo) |
| Treasury reporting | ✅ | Inflows, outflows, balances over time |
| Reconciliation | ✅ | CSV export (QuickBooks/Xero-friendly columns) |
| Payment monitoring | ✅ | Track pending, settled, and failed transactions |

**Out of scope for MVP:** custody, fiat on/off-ramp (anchor integration is Phase 3), lending,
payroll/mass payouts as a standalone product (the Stellar Disbursement Platform already covers this).

### Who uses it

| Role | What they do |
|---|---|
| `owner` | Creates the organization, manages everyone, can do everything |
| `admin` | Same permissions as owner except changing the owner role |
| `accountant` | Manages clients, invoices, vendors; creates payment requests; matches transactions; exports |
| `approver` | Approves or rejects payment requests; signs and submits approved payments |
| `viewer` | Read-only access to the organization's data |

---

## 2. How it works — end to end

### Getting paid (receivables)

```
 Accountant                 API                      Stellar                 Indexer / Worker
     │ create invoice        │                          │                          │
     ├──────────────────────►│ assign paymentRefId 42   │                          │
     │                       │ muxed = M(treasury, 42)  │                          │
     │                       │ memo  = "INV42"          │                          │
     │ send invoice          │                          │                          │
     ├──────────────────────►│ status: sent             │                          │
     │                       │                          │                          │
     │        customer opens /public/invoices/:token and pays to M... (or G... + memo INV42)
     │                       │                          │ payment lands in treasury │
     │                       │                          ├─────────────────────────►│ stream picks it up
     │                       │                          │                          │ upsert Transaction
     │                       │                          │                          │ save cursor
     │                       │                          │                          │ enqueue match job
     │                       │                          │                          │ matching engine:
     │                       │                          │                          │  muxedId 42 → invoice
     │                       │◄─────────────────────────┴──────────────────────────┤ PaymentMatch +
     │ sees invoice "paid"   │                                                     │ amountPaid, status
```

1. An accountant creates an invoice for a client in an asset such as USDC. The API assigns a
   globally unique numeric `paymentRefId`, derives the invoice's muxed address from the treasury
   account's `G...` address, and sets the memo fallback `INV<paymentRefId>`.
2. Sending the invoice makes it visible on an unauthenticated public payment page (by an unguessable
   `publicToken`) showing the address, memo, asset and amount.
3. The customer pays. Funds arrive in the business's treasury account.
4. The **indexer**, which holds a live Horizon stream for every treasury account, writes a
   `Transaction` row (idempotently, keyed on `txHash + operationIndex`), advances the account's
   cursor, and enqueues a `match-transaction` job.
5. The **worker** runs the pure **matching engine** on the transaction. A muxed id or memo gives a
   deterministic match; the invoice's `amountPaid` and status are updated. Partial payments make it
   `partially_paid`; wrong assets and overpayments are flagged for a human.
6. Anything that couldn't be matched shows up as unmatched with suggestions; an accountant matches
   it manually.
7. An hourly job marks unpaid invoices past their due date as `overdue`.

### Paying a vendor (payables)

1. An accountant creates a **payment request**: vendor, asset, amount, reason, source treasury
   account.
2. It is submitted for approval. The organization's **approval policies** decide how many approvals
   are needed and from whom (e.g. "over 1,000 USDC needs 2 of these 3 people").
3. Approvers approve or reject. Any rejection ends it; reaching the threshold makes it `approved`.
4. The API **builds an unsigned transaction** from the database values (never from the client):
   source = treasury account, destination = vendor address, asset, amount, and the vendor's memo if
   they need one (e.g. an exchange deposit).
5. An authorised member signs it in their wallet in the browser and sends back the signed XDR.
6. The API **re-decodes and verifies** the signed transaction — same hash as built, same source,
   destination, asset, amount, memo, exactly one payment operation, valid signature for this
   network — and only then submits it to Stellar.
7. When the indexer sees the outgoing payment, the request becomes `settled`.

### Reporting

The dashboard combines live balances from Horizon with indexed transactions: 30-day inflow/outflow
per asset, open and overdue invoices, and pending approvals. Treasury reports bucket flows by
day/week/month, and reconciliation exports produce a CSV for a date range.

---

## 3. Architecture

```
                         ┌──────────────────────┐
  finance-os-web ───────►│  apps/api (Fastify)  │──── build unsigned XDR / verify / submit ───┐
  (browser + wallet)     │  /v1, /docs,         │                                             │
        ▲                │  /openapi.json       │──── balances, sequence numbers ─────────┐   │
        │ OpenAPI client └──────────┬───────────┘                                         ▼   ▼
        │                           │ Prisma                                     ┌────────────────┐
        │                           ▼                                            │    Stellar     │
        │                  ┌─────────────────┐       ┌──────────────────────┐    │ Horizon / RPC  │
        │                  │   PostgreSQL    │◄──────│    apps/indexer      │◄───│  (testnet)     │
        │                  │ (all org data)  │       │ one stream / account │    └────────────────┘
        │                  └────────┬────────┘       └──────────┬───────────┘
        │                           │                           │ enqueue match-transaction
        │                           ▼                           ▼
        │                  ┌─────────────────┐       ┌──────────────────────┐
        └──────────────────│   apps/worker   │◄──────│        Redis         │
                           │ BullMQ jobs     │       │  (BullMQ queues)     │
                           └─────────────────┘       └──────────────────────┘
```

Three processes share one database:

| Process | Responsibility | Scales |
|---|---|---|
| `apps/api` | HTTP API: auth, RBAC, CRUD, approvals, tx building/verification/submission, exports | Horizontally (stateless) |
| `apps/indexer` | Streams payments from Stellar per treasury account; idempotent writes; cursor persistence; backfill CLI | One active instance (per network) |
| `apps/worker` | BullMQ processors: `match-transaction`, `overdue-invoices`, `generate-report`, `send-email` | Horizontally |

Shared logic lives in `packages/*` so it can be unit-tested without I/O:

- `packages/matching` is **pure** — `(transaction, openInvoices, clientHistory) → MatchResult` —
  so the hardest business logic is exhaustively table-tested.
- `packages/stellar` hides whether data comes from Horizon or Stellar RPC behind a `PaymentSource`
  interface, so the data source can change without touching matching or the indexer.
- `packages/config` validates every env var at startup and refuses to run on mainnet unless
  explicitly allowed.

---

## 4. Monorepo layout

```
finance-os-backend/
├── apps/
│   ├── api/                       # HTTP API (Fastify)
│   │   ├── src/auth/              #   password hashing (argon2id), opaque session tokens
│   │   ├── src/plugins/           #   auth, RBAC guard, error handler, secret guard, OpenAPI, prisma, stellar
│   │   ├── src/rbac/              #   role → permission matrix, member management rules
│   │   ├── src/routes/            #   auth, orgs, members, treasury-accounts (more per §12)
│   │   ├── src/lib/               #   pagination, serialisation, asset helpers
│   │   └── test/                  #   integration tests (Testcontainers) incl. cross-org access
│   ├── indexer/                   # Long-running Stellar watcher + backfill CLI
│   └── worker/                    # BullMQ background jobs
├── packages/
│   ├── db/                        # Prisma schema, migrations, seed, typed client, test Postgres helper
│   ├── stellar/                   # Muxed addresses, assets, memos, Horizon client + normalisation,
│   │                              #   PaymentSource, unsigned tx builder, signed-XDR verifier, SEP-53
│   ├── matching/                  # Pure payment → invoice matching engine (no I/O)
│   ├── shared/                    # Zod schemas, enums, AppError, money/decimal utils, secret detection
│   └── config/                    # Env loading + validation, network config, assets, mainnet guard
├── .github/workflows/ci.yml       # format:check, lint, typecheck, test on every push/PR
├── docker-compose.yml             # Postgres 17 + Redis 7 for local dev
├── turbo.json · pnpm-workspace.yaml · tsconfig.base.json · eslint.config.js · vitest.config.ts
├── .nvmrc                         # Node 24
├── .env.example
├── AGENTS.md                      # Non-negotiable rules for AI coding agents
├── ISSUES.md                      # Scoped open issues to reach MVP
└── README.md
```

Each package and app has its own `README.md` with package-specific notes.

---

## 5. Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 24+ (see `.nvmrc`), TypeScript (strict), ES modules |
| Monorepo | pnpm workspaces + Turborepo |
| HTTP | Fastify 5 + `@fastify/swagger` / `@fastify/swagger-ui` |
| Validation | Zod 4, shared with OpenAPI via `fastify-type-provider-zod` |
| Database | PostgreSQL 17 + Prisma 7 (`@prisma/adapter-pg`) |
| Jobs/queues | BullMQ + Redis |
| Stellar | `@stellar/stellar-sdk` (Horizon client, tx building, muxed accounts) |
| Auth | Email + password (argon2id), opaque bearer session tokens (only their SHA-256 is stored); wallet ownership via SEP-53 signed message (verifier done, routes planned) |
| Money | **Strings / `Decimal(38,7)`** — Stellar amounts have 7 decimal places. Never JS floats. |
| Tests | Vitest; Testcontainers (Postgres) for integration tests — Docker required |
| Logging | Pino |

---

## 6. Domain model

Every business record carries an `organizationId` and is scoped to an `Organization` (multi-tenant).
The full schema is in [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma).

```
User ─┬─ Session (tokenHash only)
      ├─ WalletAddress (verified public keys)
      └─ Member ─── Organization
                       ├─ TreasuryAccount (a Stellar G-address the org controls; watched by indexer)
                       ├─ Client ── Invoice ── InvoiceLineItem
                       ├─ Vendor ── PaymentRequest ── Approval
                       ├─ ApprovalPolicy ── ApprovalPolicyApprover (Member)
                       ├─ Transaction (on-chain payment, in or out)
                       ├─ PaymentMatch (Transaction ↔ Invoice | PaymentRequest)
                       └─ Export (generated reconciliation file)
```

### Key entities

**Member.role**: `owner | admin | approver | accountant | viewer`. Unique per `(organization, user)`.

**TreasuryAccount**: `stellarAddress`, `label`, `network (testnet|mainnet)`, `indexerCursor` (last
processed Horizon paging token). Unique per `(network, stellarAddress)`, so two orgs can't claim the
same account. The network is always the server's — a testnet API can't register a mainnet account.

**Client**: `name`, `email`, `knownAddresses` (sender addresses previously seen paying this client's
invoices — used by heuristic suggestions).

**Invoice**
- `number` (human, e.g. `INV-2026-0042`, unique per org), `clientId`, `treasuryAccountId`,
  `assetCode` + `assetIssuer`, `amount`, `amountPaid`, `dueDate`, line items.
- `status`: `draft → sent → partially_paid → paid` · or `overdue` · or `void`.
- Payment reference: `paymentRefId` (globally unique uint64), `muxedAddress` (`M...`), `memo`
  (`INV<paymentRefId>`, unique per treasury account). See §7.
- `publicToken`: unguessable token for the public payment page.

**Vendor**: `name`, `stellarAddress` (`G...` or `M...`), and `memoRequired` / `memo` / `memoType` for
destinations such as exchanges that require a deposit memo.

**PaymentRequest** (paying a vendor)
- `vendorId`, `sourceTreasuryAccountId`, asset, `amount`, `reason`, `attachments`, `createdByMemberId`.
- `status`: `draft → pending_approval → approved → submitted → settled` · or `rejected` · or `failed`.
- `unsignedXdr`, then `txHash`, `submittedAt`, `settledAt`, `failureReason`.

**Approval**: one decision (`approved | rejected`) per `(paymentRequest, member)`.

**ApprovalPolicy**: `threshold` (M), approvers (N, via `ApprovalPolicyApprover`), optional
`amountAbove` and `assetCode` (e.g. "USDC payments above 1,000 need 2 approvals").

**Transaction**
- Unique on `(txHash, operationIndex)` — the idempotency key (AGENTS.md rule 6).
- `direction (in|out)`, `from`, `to`, asset, `amount`, `memo`, `memoType`, `muxedId` (decimal string —
  uint64 exceeds JS safe integers), `ledger`, `createdAt` (ledger close time), `status (success|failed)`.
- `operationType`: `payment | path_payment_strict_receive | path_payment_strict_send |
  claimable_balance_claim | account_merge | contract_transfer`.

**PaymentMatch**: `transactionId`, exactly one of `invoiceId | paymentRequestId` (enforced by a
CHECK constraint), `amount`, `method (muxed|memo|contract_event|manual)`, `confidence` (0..1),
`matchedByMemberId?`.

**Export**: `type`, `format`, `from`/`to`, `status (pending|ready|failed)`, `fileKey`, `rowCount`.

### Database-level guarantees

Migrations add CHECK constraints beyond what Prisma expresses: invoice, payment-request and match
amounts must be positive (transaction amounts non-negative), a payment match targets exactly one of
invoice/payment request, match confidence is within 0..1, and approval-policy thresholds are ≥ 1. These
are covered by `packages/db/test/constraints.test.ts`.

---

## 7. Payment matching — the core of the product

Each invoice gets a payment reference so incoming payments can be matched deterministically.

**Strategy (in priority order):**

1. **Muxed account (preferred):** each invoice's `M...` address is derived from the treasury `G...`
   address + the invoice's `paymentRefId` (`deriveMuxedAddress` in `packages/stellar`). Funds land in
   the treasury account, but the muxed id tells us which invoice was paid.
2. **Memo fallback:** some wallets and exchanges don't support muxed addresses. The invoice also
   shows a `MEMO_TEXT` like `INV42` (`invoiceMemo` / `parseInvoiceMemo`) to use with the plain `G...`
   address. It is derived from the globally unique `paymentRefId`, not the invoice number, so two
   invoices can never share a memo; a uint64 always fits the 28-byte memo limit.
3. **Contract event (Phase 2):** payments made through the `invoice-registry` contract emit an event
   containing the invoice ID — fully deterministic.
4. **Heuristic suggestion:** no reference → suggest candidates by (asset, exact amount, sender
   address previously linked to the client, date window). **Suggestions are never auto-applied**; a
   human confirms.
5. **Manual match:** an accountant links a transaction to an invoice.

**Rules:**
- Partial payments → invoice becomes `partially_paid`; overpayments are flagged.
- Wrong asset (code or issuer) → not matched, flagged for review.
- Matching logic lives in `packages/matching` as pure functions. No database access inside it
  (AGENTS.md rule 4, enforced by ESLint).

The engine's result type:

```ts
type MatchResult =
  | { kind: 'matched'; invoiceId; amount; method; confidence }
  | { kind: 'suggested'; candidates: { invoiceId; score }[] }
  | { kind: 'flagged'; reason: 'wrong_asset' | 'overpayment' | 'unknown_reference' }
  | { kind: 'unmatched' };
```

> ⚠️ Muxed-account support varies across wallets and exchanges. Test with the wallets pilot
> businesses actually use before relying on muxed-only.

---

## 8. The indexer (`apps/indexer`)

Watches every `TreasuryAccount` and records payments.

- **Source:** Horizon payments streaming per account (`/accounts/{id}/payments`), resuming from the persisted `indexerCursor`.
- Captures payments, path payments, claimable-balance claims, and account merges.
- Writes `Transaction` rows idempotently (upsert on `txHash + operationIndex`), then enqueues a `match-transaction` job.
- On restart, resumes from the cursor — no gaps, no duplicates.
- Backfill command: `pnpm --filter @finance-os/indexer backfill --account G... --from <cursor|ledger>` (pages through history via the same idempotent persist path; `ledger:<n>` is supported).

> ⚠️ Verify before committing to a data source: the Stellar ecosystem is shifting from Horizon toward Stellar RPC. Stellar RPC only retains recent history (a limited window — check current docs), so it is unsuitable for long backfills on its own. The `packages/stellar` interface should hide which source is used, so you can switch to RPC events or a third-party indexer later without touching matching logic.
- **Source:** Horizon `/accounts/{id}/payments` joined with transactions (so memos are available),
  wrapped by `HorizonPaymentSource` in `packages/stellar`. It normalises payments, path payments,
  claimable-balance claims and account merges into a source-independent `ObservedPayment`.
- **Ordering:** stream records are processed strictly one at a time. If handling one fails, the
  stream stops instead of skipping it, so the cursor can never move past a gap.
- **Writes:** `Transaction` rows are upserted on `txHash + operationIndex`, the account's
  `indexerCursor` is advanced, then a `match-transaction` job is enqueued.
- **Restarts:** resume from the persisted cursor — no gaps, no duplicates.
- **Backfill:** `pnpm --filter @finance-os/indexer backfill --account G... --from <cursor|ledger:N>`
  pages through history with the same write path.

> ⚠️ The ecosystem is shifting from Horizon toward Stellar RPC. RPC retains only a limited history
> window, so it is unsuitable for long backfills on its own. The `PaymentSource` interface exists so
> the source can change (RPC events, a third-party indexer) without touching matching.

---

## 9. Outgoing payments & approvals

```
accountant creates PaymentRequest (draft)
        │ submit for approval
        ▼
pending_approval ──► approvers approve/reject (Approval rows; policy decides M-of-N)
        │  threshold met                         │ any rejection
        ▼                                        ▼
approved ──► API builds unsigned XDR          rejected
        │     (payment op, asset, amount, vendor memo if required, 15-min timeout)
        ▼
browser: authorised member signs in wallet ──► signed XDR sent to API
        │
        ▼
API re-decodes and verifies (verifySignedPayment) ──► submits to network
        │
        ▼
submitted ──► indexer sees the tx hash ──► settled   (or failed → reason stored)
```

**Critical check:** `verifySignedPayment` (`packages/stellar/src/tx/verify-payment.ts`) rejects the
signed transaction if anything differs from the approved request: its hash differs from the one
built, the source, destination, asset, amount or memo differ, there isn't exactly one payment
operation, it's a fee-bump wrapper, or there's no valid signature from an allowed signer for this
network (the passphrase is part of the signed hash, so a transaction signed for another network
fails). An approval can never be bypassed by swapping the transaction.

Batch payouts (several approved requests in one transaction) are a stretch goal.

---

## 10. API

All business routes are under `/v1`, org-scoped via `/orgs/:orgId/...`. Docs are generated from the
Zod schemas at `/docs` (Swagger UI) and `/openapi.json`. **The frontend generates its typed client
from `/openapi.json` — it is the contract between repos.**

### Conventions

- **Auth:** `Authorization: Bearer <token>` from register/login. Tokens are opaque random values;
  only their SHA-256 is stored. Sessions last 30 days and can be revoked with logout.
- **Org access:** a caller who isn't a member of `:orgId` gets **404** — the same as for a missing
  org, so org ids can't be probed. A member whose role lacks the permission gets **403**. See the RBAC
  matrix in [`apps/api/README.md`](./apps/api/README.md).
- **Errors:** always `{ "error": { "code", "message", "details?" } }`. Validation failures are 400
  with `code: "VALIDATION_FAILED"`; unexpected errors are 500 `INTERNAL` and logged.
- **Secret guard:** any request body containing something that looks like a Stellar secret key is
  rejected with 400 before validation runs.
- **Pagination:** list endpoints use keyset pagination — `?limit=&cursor=` → `{ items, nextCursor }`.
- **Amounts:** always decimal strings with up to 7 places.

### Implemented

```
GET    /health                         # liveness (outside /v1)

POST   /v1/auth/register | /v1/auth/login | /v1/auth/logout
GET    /v1/auth/me                     # user + memberships

GET    /v1/orgs                        # orgs the caller belongs to
POST   /v1/orgs                        # caller becomes owner
GET    /v1/orgs/:orgId
PATCH  /v1/orgs/:orgId
CRUD   /v1/orgs/:orgId/members
CRUD   /v1/orgs/:orgId/treasury-accounts
```

### Planned (tracked in [ISSUES.md](./ISSUES.md))

```
POST   /auth/wallet/challenge | /auth/wallet/verify     # link a wallet (SEP-53)
GET    /orgs/:orgId/dashboard
CRUD   /orgs/:orgId/clients | /vendors | /invoices | /payment-requests | /approval-policies
POST   /orgs/:orgId/invoices/:id/send | /void
GET    /public/invoices/:publicToken                    # unauthenticated payment page data
POST   /orgs/:orgId/payment-requests/:id/approve | /reject
POST   /orgs/:orgId/payment-requests/:id/build-tx       # returns unsigned XDR
POST   /orgs/:orgId/payment-requests/:id/submit         # accepts signed XDR
GET    /orgs/:orgId/transactions?direction=&status=&unmatched=true
POST   /orgs/:orgId/transactions/:id/match              # manual match
GET    /orgs/:orgId/reports/treasury?from=&to=
POST   /orgs/:orgId/exports  { format: "csv", type: "reconciliation", from, to }
GET    /orgs/:orgId/exports/:id/download
```

### Example

```bash
# Log in as the seeded owner
TOKEN=$(curl -s localhost:3000/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"owner@demo.test","password":"demo-password"}' | jq -r .token)

# List orgs, then that org's treasury accounts
ORG=$(curl -s localhost:3000/v1/orgs -H "authorization: Bearer $TOKEN" | jq -r '.items[0].id')
curl -s localhost:3000/v1/orgs/$ORG/treasury-accounts -H "authorization: Bearer $TOKEN"
```

---

## 11. Security model

| Threat | Mitigation |
|---|---|
| Backend compromise drains funds | Non-custodial: no secret keys exist server-side. Bodies containing `S...` keys are rejected. |
| Approved payment swapped for another | Signed XDR must hash-match the built tx and pass field-by-field verification |
| Cross-tenant data access | Every query filters by `organizationId`; non-members get 404; cross-org test suite covers every org route |
| Privilege escalation | Permission-based RBAC; only owners touch the owner role; an org always keeps ≥ 1 owner (rows locked during changes) |
| Session token leak via DB | Only SHA-256 of tokens stored; sessions expire and are revocable |
| Password cracking / user enumeration | argon2id; login does equal work for unknown emails |
| Float rounding on money | `Decimal(38,7)` in DB, decimal strings in API; floats on amounts are treated as bugs |
| Accidental mainnet use | Mainnet requires `STELLAR_NETWORK=mainnet` **and** `ALLOW_MAINNET=true`; asset issuers keyed by network |
| Indexer duplicates | Unique `(txHash, operationIndex)` + upserts |

Known gaps (CORS, rate limiting, readiness checks) are tracked in [ISSUES.md #10](./ISSUES.md#10-production-hardening-cors-rate-limiting-readiness-session-cleanup).

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance_os
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me                        # required (min 8 chars); sessions currently use opaque tokens
STELLAR_NETWORK=testnet                     # testnet | mainnet
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
USDC_ISSUER=                                # set per network — see note below
CONTRACT_DEPLOYMENTS_PATH=./deployments/testnet.json   # copied from contracts repo (Phase 2)
WEB_APP_URL=http://localhost:5173
API_PORT=3000
INDEXER_POLL_INTERVAL_MS=30000
LOG_LEVEL=info
ALLOW_MAINNET=false                         # mainnet refuses to start unless this is "true"
SEED_TREASURY_ADDRESS=                      # optional testnet G-address for `pnpm db:seed`
```
---

## 12. Build order & status

Status: ✅ done · 🟡 partly done · ⬜ not started

| # | Task | Done when | Status |
|---|---|---|---|
| 1 | Scaffold monorepo: pnpm, turbo, tsconfig, eslint, vitest, docker-compose | `pnpm dev` starts empty apps | ✅ |
| 2 | `packages/config` + `packages/shared` (env, enums, money utils) | Unit tests for decimal math pass | ✅ |
| 3 | `packages/db`: Prisma schema from §6, migrations, seed | `pnpm db:seed` creates demo org | ✅ |
| 4 | `apps/api`: auth + orgs + members + RBAC middleware | Cross-org access tests pass | ✅ |
| 5 | Clients, invoices, vendors CRUD + OpenAPI | `/openapi.json` validates | 🟡 treasury accounts done; clients, invoices, vendors to do ([#4](./ISSUES.md#4-clients-and-vendors-crud-routes), [#5](./ISSUES.md#5-invoice-lifecycle-routes--public-payment-page)) |
| 6 | `packages/stellar`: muxed address derivation, asset config, payment tx builder | Unit tests round-trip muxed IDs | ✅ (also memos, Horizon normalisation, signed-XDR verification, SEP-53) |
| 7 | `packages/matching` engine | Table-driven tests for every case in §7 | ✅ |
| 8 | `apps/indexer` with cursor persistence | Testnet payment appears as a Transaction within seconds | 🟡 `PaymentSource` + backfill CLI args; streaming not wired ([#2](./ISSUES.md#2-wire-the-indexer-stream-payments-with-cursor-persistence-and-backfill)) |
| 9 | `apps/worker`: match job, overdue job | Pay invoice on testnet → status `paid` | ⬜ queue names only ([#3](./ISSUES.md#3-worker-match-transaction-and-overdue-invoices-jobs)) |
| 10 | Payment requests + approvals + build-tx + submit with XDR verification | Tampered XDR is rejected in tests | 🟡 `verifySignedPayment` done; routes to do ([#6](./ISSUES.md#6-approval-policies-and-payment-request-approval-workflow), [#7](./ISSUES.md#7-build-unsigned-xdr-verify-signed-xdr-submit-and-settle-payment-requests)) |
| 11 | Dashboard + treasury report endpoints | Numbers match seeded data | ⬜ ([#8](./ISSUES.md#8-transactions-api-manual-matching-dashboard-and-treasury-report)) |
| 12 | CSV reconciliation export | Opens cleanly in Excel/Sheets | ⬜ ([#9](./ISSUES.md#9-csv-reconciliation-export)) |

---

## 13. Getting started

**Prerequisites:** Node.js 24 (`nvm use`), pnpm (via Corepack: `corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env                 # then adjust values (see §14)
docker compose up -d                 # Postgres + Redis
pnpm db:migrate && pnpm db:seed      # schema + demo data
pnpm dev                             # runs api, indexer, worker via turbo
```

Once running: API on `http://localhost:3000`, Swagger UI at `/docs`, OpenAPI at `/openapi.json`,
liveness at `/health`.

### Demo data

`pnpm db:seed` creates the `demo` organization with:

- Six logins, all with password `demo-password`: `owner@demo.test`, `admin@demo.test`,
  `approver1@demo.test`, `approver2@demo.test`, `accountant@demo.test`, `viewer@demo.test`.
- A testnet treasury account — set `SEED_TREASURY_ADDRESS` to a testnet G-address you control,
  otherwise a random receive-only address is used.
- Two clients with invoices, two vendors (one exchange requiring a memo), an approval policy, and a
  pending payment request.

Fund testnet accounts with [Friendbot](https://friendbot.stellar.org/?addr=G...).

### Useful commands

```bash
pnpm --filter @finance-os/api dev          # one app only
pnpm db:reset                              # drop, re-migrate, re-seed
pnpm --filter @finance-os/db db:studio     # browse the database
pnpm --filter @finance-os/indexer backfill --account G... --from <cursor|ledger:N>
```

---

## 14. Configuration

Validated at startup by [`packages/config/src/env.schema.ts`](./packages/config/src/env.schema.ts);
an invalid value stops the process with a clear error.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | ✓ | — | Redis for BullMQ |
| `JWT_SECRET` | ✓ | — | Min 8 chars. Currently unused — sessions are opaque tokens (see ISSUES.md #10) |
| `STELLAR_NETWORK` | | `testnet` | `testnet` or `mainnet` |
| `HORIZON_URL` | ✓ | — | e.g. `https://horizon-testnet.stellar.org` |
| `STELLAR_RPC_URL` | ✓ | — | e.g. `https://soroban-testnet.stellar.org` |
| `USDC_ISSUER` | | — | USDC issuer for the active network — take from Circle's official docs |
| `CONTRACT_DEPLOYMENTS_PATH` | | — | Contract addresses from the contracts repo (Phase 2) |
| `WEB_APP_URL` | | `http://localhost:5173` | Frontend origin |
| `API_PORT` | | `3000` | API listen port |
| `LOG_LEVEL` | | `info` | `fatal`…`trace` |
| `NODE_ENV` | | `development` | Enables pretty logs in development |
| `ALLOW_MAINNET` | | `false` | Must be `true` for mainnet to start |
| `SEED_TREASURY_ADDRESS` | | — | Testnet G-address used by `pnpm db:seed` |

**Mainnet guard:** every app calls `assertNetworkAllowed()` on startup. `STELLAR_NETWORK=mainnet`
alone is not enough — `ALLOW_MAINNET=true` must also be set (AGENTS.md rule 8).

> ⚠️ Asset issuers must come from Circle's official documentation for each network, never from
> examples. They live in `packages/config/src/assets.ts`, keyed by network, so testnet and mainnet
> can't be mixed.

---

## 15. Testing and quality gate

```bash
pnpm check    # format:check + lint + typecheck + test (what CI runs)
pnpm format   # fix formatting with Prettier
pnpm test     # tests only
```

- **Unit tests** sit next to the code (`*.test.ts`): money arithmetic, muxed round-trips, memo
  parsing, Horizon normalisation, XDR building and verification, RBAC rules.
- **Integration tests** (`apps/api/test`, `packages/db/test`) start a throwaway Postgres with
  Testcontainers, so **Docker must be running**. They exercise the real server and DB constraints.
- **Cross-org tests** (`apps/api/test/cross-org.test.ts`) assert every org route refuses callers from
  another org. Every new org route must be added there.
- **OpenAPI test** ensures the generated document is valid.

CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`, then format:check, lint,
typecheck and test on every push and PR.

---

## 16. Contributing

| # | Task | Done when | Status |
|---|---|---|---|
| 1 | Scaffold monorepo: pnpm, turbo, tsconfig, eslint, vitest, docker-compose | `pnpm dev` starts empty apps | ✅ |
| 2 | `packages/config` + `packages/shared` (env, enums, money utils) | Unit tests for decimal math pass | ✅ |
| 3 | `packages/db`: Prisma schema from §4, migrations, seed | `pnpm db:seed` creates demo org | ✅ |
| 4 | `apps/api`: auth + orgs + members + RBAC middleware | Cross-org access tests pass | ✅ |
| 5 | Clients, invoices, vendors CRUD + OpenAPI | `/openapi.json` validates | 🟡 treasury accounts done; clients, invoices, vendors to do |
| 6 | `packages/stellar`: muxed address derivation, asset config, payment tx builder | Unit tests round-trip muxed IDs | ✅ (also memos, Horizon normalization, signed-XDR verification) |
| 7 | `packages/matching` engine | Table-driven tests for every case in §5 | ⬜ types only |
| 8 | `apps/indexer` with cursor persistence | Testnet payment appears as a Transaction within seconds | ✅ Supervisor streams every TreasuryAccount with cursor persistence, backoff restart and backfill (manual testnet check pending) |
| 9 | `apps/worker`: match job, overdue job | End-to-end: pay invoice on testnet → status `paid` | ⬜ queue names only |
| 10 | Payment requests + approvals + build-tx + submit with XDR verification | Tampered XDR is rejected in tests | 🟡 `verifySignedPayment` done and tested; routes to do |
| 11 | Dashboard + treasury report endpoints | Numbers match seeded data | ⬜ |
| 12 | CSV reconciliation export | Opens cleanly in Excel/Sheets | ⬜ |
1. Read [`AGENTS.md`](./AGENTS.md) — its rules apply to humans too:
   no secret keys, no floats on amounts, every query org-scoped, `packages/matching` stays pure,
   Zod schemas on every route, idempotent indexer writes, testnet only.
2. Pick an issue from [`ISSUES.md`](./ISSUES.md). Each has tasks and acceptance criteria.
3. Branch from `main`, keep the change to one issue, and include tests.
4. Run `pnpm check` before pushing.

### Prompt template for AI-assisted tasks

```
You are working in finance-os-backend. Read README.md and AGENTS.md first.
Task: <issue # and title from ISSUES.md>.
Constraints: follow AGENTS.md rules. Don't modify unrelated packages.
Deliver: code + tests. Then list any assumptions you made.
```

---

## 17. Roadmap and open questions

- **Phase 1 (MVP):** everything above, testnet, CSV export, 3 pilot businesses.
- **Phase 2:** on-chain approvals and invoice registry via `finance-os-contracts`; contract events as
  a match source.
- **Phase 3:** anchor integration for local fiat payouts (SEP-24/SEP-31 — confirm which anchors
  support NGN corridors at the time), QuickBooks/Xero sync, reporting-currency conversion (FX source TBD).

**Open questions**

- Hosted vs self-hostable? (affects SCF open-source positioning)
- Which accounting tools do pilot businesses actually use? (answer from customer interviews before
  building integrations)
- Horizon long-term vs RPC + indexer service — revisit before mainnet.
