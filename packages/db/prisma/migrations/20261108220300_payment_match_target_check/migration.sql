-- A match settles exactly one thing: an invoice OR a payment request.
ALTER TABLE "payment_matches"
  ADD CONSTRAINT "payment_matches_exactly_one_target"
  CHECK (num_nonnulls("invoiceId", "paymentRequestId") = 1);
