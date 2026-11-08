-- Money must never go negative; requested amounts must be positive.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "invoices_amount_paid_non_negative" CHECK ("amountPaid" >= 0);

ALTER TABLE "invoice_line_items"
  ADD CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "invoice_line_items_amounts_non_negative" CHECK ("unitPrice" >= 0 AND "amount" >= 0);

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "payment_matches"
  ADD CONSTRAINT "payment_matches_amount_positive" CHECK ("amount" > 0);
