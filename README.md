# Stellar Finance OS — Backend

> Repo 2 of 3 · `finance-os-backend` · Node.js + TypeScript monorepo
> Sibling repos: [`finance-os-web`](../finance-os-web) (frontend) · [`finance-os-contracts`](../finance-os-contracts) (Soroban)

The backend is the core of Stellar Business Treasury & Finance OS. It owns the business data (organizations, invoices, vendors, payment requests), watches Stellar for incoming and outgoing payments, matches payments to invoices, runs the approval workflow, and produces accounting-ready exports.

**Stellar is the settlement layer. This repo is the business layer.**

**Non-custodial by design:** the backend never stores or uses a business's secret keys. It builds unsigned transactions (XDR); the user signs them in their wallet on the frontend.

---

## 1. What this repo does (MVP scope)

| Feature | Owned here | Notes |
|---|---|---|
| Business dashboard data | ✅ | Balances per treasury account, inflow/outflow totals |
| Invoice management | ✅ | Create, send, track, void; unique payment reference per invoice |
| Payment matching | ✅ | Auto-match incoming payments to invoices; manual match fallback |
| Vendor management | ✅ | Vendor records + Stellar payout addresses |
| Approval workflow | ✅ | Off-chain M-of-N approvals in MVP (on-chain in Phase 2 via contracts repo) |
| Treasury reporting | ✅ | Inflows, outflows, balances over time |
| Reconciliation | ✅ | CSV export (QuickBooks/Xero-friendly columns) |
| Payment monitoring | ✅ | Track pending, settled, and failed transactions |

**Out of scope for MVP:** custody, fiat on/off-ramp (anchor integration is Phase 3), lending, payroll/mass payouts as a standalone product (Stellar Disbursement Platform already covers this).

---

## 2. Monorepo layout

```
finance-os-backend/
├── apps/
│   ├── api/                 # HTTP API (Fastify). Auth, CRUD, approvals, tx building, exports
│   ├── indexer/             # Long-running Stellar watcher. Streams payments, writes Transactions
│   └── worker/              # Background jobs: matching, overdue checks, report generation, emails
├── packages/
│   ├── db/                  # Prisma schema, migrations, seed, typed client
│   ├── stellar/             # Stellar helpers: tx builders, muxed accounts, asset config, Horizon/RPC clients
│   ├── matching/            # Pure payment→invoice matching engine (no I/O, heavily unit-tested)
│   ├── shared/              # Zod schemas, enums, error types, money/decimal utils
│   └── config/              # Env loading + validation (zod), network config (testnet/mainnet)
├── docker-compose.yml       # Postgres + Redis for local dev
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
├── AGENTS.md                # Rules for AI coding agents (see §10)
└── README.md
```

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js LTS, TypeScript (strict) |
| Monorepo | pnpm workspaces + Turborepo |
| HTTP | Fastify + `@fastify/swagger` (generates OpenAPI) |
| Validation | Zod (shared with OpenAPI via `fastify-type-provider-zod`) |
| Database | PostgreSQL + Prisma |
| Jobs/queues | BullMQ + Redis |
| Stellar | `@stellar/stellar-sdk` (Horizon + RPC clients, tx building) |
| Auth | Email + password (argon2) with session/JWT; wallet ownership proven via signed challenge |
| Money | Store amounts as **strings / `Decimal(38,7)`** — Stellar amounts have 7 decimal places. Never use JS floats. |
| Tests | Vitest + Testcontainers (Postgres) for integration |
| Logging | Pino |

---

## 4. Domain model

Every business record is scoped to an `Organization` (multi-tenant).

```
Organization ─┬─ Member (user + role)
              ├─ TreasuryAccount (a Stellar G-address the org controls, watched by indexer)
              ├─ Client ── Invoice ── InvoiceLineItem
              ├─ Vendor ── PaymentRequest ── Approval
              ├─ ApprovalPolicy
              ├─ Transaction (on-chain payment, in or out)
              ├─ PaymentMatch (Transaction ↔ Invoice or PaymentRequest)
              └─ Export (generated reconciliation file)
```

### Key entities

**Member.role**: `owner | admin | approver | accountant | viewer`

**TreasuryAccount**: `stellarAddress`, `label`, `network (testnet|mainnet)`, `indexerCursor` (last processed paging token).

**Invoice**
- `number` (human, e.g. `INV-2026-0042`), `clientId`, `asset` (e.g. USDC), `amount`, `dueDate`
- `status`: `draft → sent → partially_paid → paid` · or `overdue` · or `void`
- `paymentReference`: how incoming payments find this invoice (see §5)
- `amountPaid` (derived from matches)

**PaymentRequest** (paying a vendor)
- `vendorId`, `asset`, `amount`, `reason`, `attachments`
- `status`: `draft → pending_approval → approved → submitted → settled` · or `rejected` · or `failed`
- `unsignedXdr`, `txHash` once submitted

**ApprovalPolicy**: `threshold` (M), `approverMemberIds` (N), optional `amountAbove` rule (e.g. payments > $1,000 need 2 approvals).

**Transaction**
- Unique on `(txHash, operationIndex)` — this is the idempotency key
- `direction (in|out)`, `from`, `to`, `asset`, `amount`, `memo`, `memoType`, `muxedId`, `ledger`, `createdAt`, `status (success|failed)`
- `operationType`: `payment | path_payment_strict_receive | path_payment_strict_send | claimable_balance_claim | account_merge | contract_transfer`

**PaymentMatch**: `transactionId`, `invoiceId | paymentRequestId`, `amount`, `method (muxed|memo|contract_event|manual)`, `confidence`, `matchedByMemberId?`

---

## 5. Payment matching — the core of the product

Each invoice gets a payment reference so incoming payments can be matched deterministically.

**Strategy (in priority order):**

1. **Muxed account (preferred):** each invoice gets a unique `M...` address derived from the treasury `G...` address + the invoice's numeric ID. Funds land in the same treasury account, but the muxed ID tells us which invoice was paid.
2. **Memo fallback:** some wallets and exchanges don't support muxed addresses. The invoice also shows a memo (`MEMO_ID` or short `MEMO_TEXT` like `INV0042`) to use with the plain `G...` address.
3. **Contract event (Phase 2):** payments made through the `invoice-registry` contract emit an event containing the invoice ID — fully deterministic.
4. **Heuristic suggestion:** no reference found → suggest candidates by (asset, exact amount, sender address previously linked to the client, date window). **Suggestions are never auto-applied**; a human confirms.
5. **Manual match:** accountant links a transaction to an invoice in the UI.

**Rules:**
- Partial payments → invoice becomes `partially_paid`; overpayments are flagged.
- Wrong asset → not matched, flagged for review.
- Matching logic lives in `packages/matching` as pure functions: `(transaction, openInvoices, clientHistory) → MatchResult`. No database access inside it.

> ⚠️ To verify during build: muxed-account support varies across wallets and exchanges. Test with the wallets your pilot businesses actually use before relying on muxed-only.

---

## 6. The indexer (`apps/indexer`)

Watches every `TreasuryAccount` and records payments.

- **Source:** Horizon payments streaming per account (`/accounts/{id}/payments`), resuming from the persisted `indexerCursor`.
- Captures payments, path payments, claimable-balance claims, and account merges.
- Writes `Transaction` rows idempotently (upsert on `txHash + operationIndex`), then enqueues a `match-transaction` job.
- On restart, resumes from the cursor — no gaps, no duplicates.
- Backfill command: `pnpm --filter indexer backfill --account G... --from <cursor|ledger>`.

> ⚠️ Verify before committing to a data source: the Stellar ecosystem is shifting from Horizon toward Stellar RPC. Stellar RPC only retains recent history (a limited window — check current docs), so it is unsuitable for long backfills on its own. The `packages/stellar` interface should hide which source is used, so you can switch to RPC events or a third-party indexer later without touching matching logic.

---

## 7. Outgoing payments & approvals

```
accountant creates PaymentRequest
        │
        ▼
pending_approval ──► approvers approve/reject in UI (recorded as Approval rows)
        │  threshold met
        ▼
approved ──► API builds unsigned XDR (payment op, correct asset, memo if vendor requires)
        │
        ▼
frontend: authorised member signs in wallet ──► signed XDR sent to API
        │
        ▼
API validates the signed tx matches the approved request exactly
(destination, asset, amount, memo, source) ──► submits to network
        │
        ▼
submitted ──► indexer sees it ──► settled   (or failed → reason stored)
```

**Critical check:** before submitting, the API re-decodes the signed XDR and rejects it if anything differs from the approved request. Approval must never be bypassable by swapping the transaction.

Batch payouts (several approved requests in one transaction, up to Stellar's operation limit per transaction) are a stretch goal.

---

## 8. API surface (v1)

All routes are under `/v1`, org-scoped via `/orgs/:orgId/...`, and documented automatically at `/docs` (Swagger UI) and `/openapi.json`. **The frontend generates its typed client from `/openapi.json` — this file is the contract between repos.**

```
POST   /auth/register | /auth/login | /auth/logout
POST   /auth/wallet/challenge         # returns a challenge to sign
POST   /auth/wallet/verify            # links a wallet address to the user

GET    /orgs/:orgId/dashboard          # balances, 30-day inflow/outflow, open invoices, pending approvals
CRUD   /orgs/:orgId/treasury-accounts
CRUD   /orgs/:orgId/clients
CRUD   /orgs/:orgId/invoices
POST   /orgs/:orgId/invoices/:id/send
POST   /orgs/:orgId/invoices/:id/void
GET    /public/invoices/:publicToken   # unauthenticated payment page data
CRUD   /orgs/:orgId/vendors
CRUD   /orgs/:orgId/payment-requests
POST   /orgs/:orgId/payment-requests/:id/approve | /reject
POST   /orgs/:orgId/payment-requests/:id/build-tx    # returns unsigned XDR
POST   /orgs/:orgId/payment-requests/:id/submit      # accepts signed XDR
GET    /orgs/:orgId/transactions?direction=&status=&unmatched=true
POST   /orgs/:orgId/transactions/:id/match           # manual match
GET    /orgs/:orgId/reports/treasury?from=&to=
POST   /orgs/:orgId/exports  { format: "csv", type: "reconciliation", from, to }
GET    /orgs/:orgId/exports/:id/download
CRUD   /orgs/:orgId/approval-policies
CRUD   /orgs/:orgId/members
```

---

## 9. Configuration

`.env.example`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance_os
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
STELLAR_NETWORK=testnet                     # testnet | mainnet
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
USDC_ISSUER=                                # set per network — see note below
CONTRACT_DEPLOYMENTS_PATH=./deployments/testnet.json   # copied from contracts repo (Phase 2)
WEB_APP_URL=http://localhost:5173
```

> ⚠️ Asset issuers must be taken from Circle's official documentation for each network, not copied from examples. Keep them in `packages/config/assets.ts`, keyed by network, so testnet and mainnet can't be mixed.

### Local development

```bash
pnpm install
cp .env.example .env                 # then adjust values
docker compose up -d                 # Postgres + Redis
pnpm db:migrate && pnpm db:seed      # seed creates a demo org with testnet accounts
pnpm dev                             # runs api, indexer, worker via turbo
```

Use Friendbot to fund testnet accounts.

---

## 10. Building this with AI — rules (`AGENTS.md`)

The rules live in [`AGENTS.md`](./AGENTS.md).

### Build order (one task per AI session)

| # | Task | Done when |
|---|---|---|
| 1 | Scaffold monorepo: pnpm, turbo, tsconfig, eslint, vitest, docker-compose | `pnpm dev` starts empty apps |
| 2 | `packages/config` + `packages/shared` (env, enums, money utils) | Unit tests for decimal math pass |
| 3 | `packages/db`: Prisma schema from §4, migrations, seed | `pnpm db:seed` creates demo org |
| 4 | `apps/api`: auth + orgs + members + RBAC middleware | Cross-org access tests pass |
| 5 | Clients, invoices, vendors CRUD + OpenAPI | `/openapi.json` validates |
| 6 | `packages/stellar`: muxed address derivation, asset config, payment tx builder | Unit tests round-trip muxed IDs |
| 7 | `packages/matching` engine | Table-driven tests for every case in §5 |
| 8 | `apps/indexer` with cursor persistence | Testnet payment appears as a Transaction within seconds |
| 9 | `apps/worker`: match job, overdue job | End-to-end: pay invoice on testnet → status `paid` |
| 10 | Payment requests + approvals + build-tx + submit with XDR verification | Tampered XDR is rejected in tests |
| 11 | Dashboard + treasury report endpoints | Numbers match seeded data |
| 12 | CSV reconciliation export | Opens cleanly in Excel/Sheets |

### Prompt template for each task

```
You are working in finance-os-backend. Read README.md and AGENTS.md first.
Task: <task # and name from the build order>.
Constraints: follow AGENTS.md rules. Don't modify unrelated packages.
Deliver: code + tests. Then list any assumptions you made.
```

---

## 11. Roadmap

- **Phase 1 (MVP):** everything above, testnet, CSV export, 3 pilot businesses.
- **Phase 2:** on-chain approvals and invoice registry via `finance-os-contracts`; contract events as a match source.
- **Phase 3:** anchor integration for local fiat payouts (SEP-24/SEP-31 — confirm which anchors support NGN corridors at the time), QuickBooks/Xero sync, reporting-currency conversion (FX source TBD).

## 12. Open questions

- Hosted vs self-hostable? (affects SCF open-source positioning)
- Which accounting tools do pilot businesses actually use? (answer from customer interviews before building integrations)
- Horizon long-term vs RPC + indexer service — revisit before mainnet.
