/**
 * MEMO_TEXT fallback for wallets without muxed support (README §5.2), e.g.
 * paymentRefId 42 → "INV42". Derived from the globally unique paymentRefId
 * (not the invoice number) so two invoices can never share a memo. A uint64
 * is at most 20 digits, so this always fits the 28-byte limit.
 */
export function invoiceMemo(paymentRefId: bigint): string {
  return `INV${paymentRefId}`;
}

/** Inverse of invoiceMemo: the paymentRefId a memo refers to, or null. */
export function parseInvoiceMemo(memo: string): bigint | null {
  const m = /^INV(\d{1,20})$/.exec(memo.trim().toUpperCase());
  return m ? BigInt(m[1]!) : null;
}
