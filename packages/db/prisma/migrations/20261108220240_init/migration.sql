-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'admin', 'approver', 'accountant', 'viewer');

-- CreateEnum
CREATE TYPE "StellarNetwork" AS ENUM ('testnet', 'mainnet');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'submitted', 'settled', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('success', 'failed');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('payment', 'path_payment_strict_receive', 'path_payment_strict_send', 'claimable_balance_claim', 'account_merge', 'contract_transfer');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('muxed', 'memo', 'contract_event', 'manual');

-- CreateEnum
CREATE TYPE "MemoType" AS ENUM ('none', 'text', 'id', 'hash', 'return');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_addresses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "stellarAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "network" "StellarNetwork" NOT NULL,
    "indexerCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "knownAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "amount" DECIMAL(38,7) NOT NULL,
    "amountPaid" DECIMAL(38,7) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "treasuryAccountId" UUID NOT NULL,
    "paymentRefId" BIGSERIAL NOT NULL,
    "muxedAddress" TEXT,
    "memo" TEXT,
    "publicToken" TEXT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(38,7) NOT NULL,
    "unitPrice" DECIMAL(38,7) NOT NULL,
    "amount" DECIMAL(38,7) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "stellarAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memoRequired" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "memoType" "MemoType" NOT NULL DEFAULT 'none',

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "amount" DECIMAL(38,7) NOT NULL,
    "reason" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" UUID NOT NULL,
    "sourceTreasuryAccountId" UUID NOT NULL,
    "unsignedXdr" TEXT,
    "txHash" TEXT,
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "paymentRequestId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "amountAbove" DECIMAL(38,7),
    "assetCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policy_approvers" (
    "policyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "approval_policy_approvers_pkey" PRIMARY KEY ("policyId","memberId")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "treasuryAccountId" UUID NOT NULL,
    "txHash" TEXT NOT NULL,
    "operationIndex" INTEGER NOT NULL,
    "pagingToken" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "operationType" "OperationType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "amount" DECIMAL(38,7) NOT NULL,
    "memo" TEXT,
    "memoType" "MemoType" NOT NULL DEFAULT 'none',
    "muxedId" TEXT,
    "ledger" INTEGER NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_matches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "invoiceId" UUID,
    "paymentRequestId" UUID,
    "amount" DECIMAL(38,7) NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "matchedByMemberId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'reconciliation',
    "format" TEXT NOT NULL DEFAULT 'csv',
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'pending',
    "fileKey" TEXT,
    "rowCount" INTEGER,
    "requestedByMemberId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_addresses_address_key" ON "wallet_addresses"("address");

-- CreateIndex
CREATE INDEX "wallet_addresses_userId_idx" ON "wallet_addresses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "members_userId_idx" ON "members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "members_organizationId_userId_key" ON "members"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "treasury_accounts_organizationId_idx" ON "treasury_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_network_stellarAddress_key" ON "treasury_accounts"("network", "stellarAddress");

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "clients"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_paymentRefId_key" ON "invoices"("paymentRefId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_muxedAddress_key" ON "invoices"("muxedAddress");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_publicToken_key" ON "invoices"("publicToken");

-- CreateIndex
CREATE INDEX "invoices_organizationId_status_idx" ON "invoices"("organizationId", "status");

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

-- CreateIndex
CREATE INDEX "invoices_treasuryAccountId_idx" ON "invoices"("treasuryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_number_key" ON "invoices"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_treasuryAccountId_memo_key" ON "invoices"("treasuryAccountId", "memo");

-- CreateIndex
CREATE INDEX "invoice_line_items_organizationId_idx" ON "invoice_line_items"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_items_invoiceId_position_key" ON "invoice_line_items"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "vendors_organizationId_idx" ON "vendors"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_txHash_key" ON "payment_requests"("txHash");

-- CreateIndex
CREATE INDEX "payment_requests_organizationId_status_idx" ON "payment_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payment_requests_vendorId_idx" ON "payment_requests"("vendorId");

-- CreateIndex
CREATE INDEX "approvals_organizationId_idx" ON "approvals"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_paymentRequestId_memberId_key" ON "approvals"("paymentRequestId", "memberId");

-- CreateIndex
CREATE INDEX "approval_policies_organizationId_idx" ON "approval_policies"("organizationId");

-- CreateIndex
CREATE INDEX "approval_policy_approvers_memberId_idx" ON "approval_policy_approvers"("memberId");

-- CreateIndex
CREATE INDEX "transactions_organizationId_createdAt_idx" ON "transactions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_treasuryAccountId_idx" ON "transactions"("treasuryAccountId");

-- CreateIndex
CREATE INDEX "transactions_muxedId_idx" ON "transactions"("muxedId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_txHash_operationIndex_key" ON "transactions"("txHash", "operationIndex");

-- CreateIndex
CREATE INDEX "payment_matches_organizationId_idx" ON "payment_matches"("organizationId");

-- CreateIndex
CREATE INDEX "payment_matches_transactionId_idx" ON "payment_matches"("transactionId");

-- CreateIndex
CREATE INDEX "payment_matches_invoiceId_idx" ON "payment_matches"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_matches_paymentRequestId_idx" ON "payment_matches"("paymentRequestId");

-- CreateIndex
CREATE INDEX "exports_organizationId_createdAt_idx" ON "exports"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_sourceTreasuryAccountId_fkey" FOREIGN KEY ("sourceTreasuryAccountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policy_approvers" ADD CONSTRAINT "approval_policy_approvers_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "approval_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policy_approvers" ADD CONSTRAINT "approval_policy_approvers_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_matchedByMemberId_fkey" FOREIGN KEY ("matchedByMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_requestedByMemberId_fkey" FOREIGN KEY ("requestedByMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
