import { describe, expect, it } from 'vitest';
import { invoiceMemo, parseInvoiceMemo } from './invoice-memo.js';

describe('invoice memo', () => {
  it('round-trips and is case/whitespace tolerant', () => {
    expect(invoiceMemo(42n)).toBe('INV42');
    expect(parseInvoiceMemo(' inv42 ')).toBe(42n);
  });
  it('rejects non-invoice memos', () => {
    for (const m of ['INV', 'INV-42', 'PO42', 'INV42x', '']) expect(parseInvoiceMemo(m)).toBeNull();
  });
});
