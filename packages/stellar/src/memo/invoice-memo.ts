/** Short MEMO_TEXT fallback, e.g. INV-2026-0042 → INV0042 (README §5.2). */
export function invoiceMemo(invoiceNumber: string): string {
  const tail = invoiceNumber.split('-').at(-1) ?? invoiceNumber;
  return `INV${tail}`.slice(0, 28);
}
