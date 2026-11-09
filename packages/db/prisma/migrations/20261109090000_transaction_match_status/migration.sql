-- CreateEnum
CREATE TYPE "TransactionMatchStatus" AS ENUM ('suggested', 'flagged');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "matchStatus" "TransactionMatchStatus",
ADD COLUMN "matchNote" TEXT;

-- CreateIndex
CREATE INDEX "transactions_organizationId_matchStatus_idx" ON "transactions"("organizationId", "matchStatus");
