ALTER TABLE "approval_policies"
  ADD CONSTRAINT "approval_policies_threshold_min" CHECK ("threshold" >= 1),
  ADD CONSTRAINT "approval_policies_amount_above_non_negative" CHECK ("amountAbove" IS NULL OR "amountAbove" >= 0);

ALTER TABLE "payment_matches"
  ADD CONSTRAINT "payment_matches_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_operation_index_non_negative" CHECK ("operationIndex" >= 0);
