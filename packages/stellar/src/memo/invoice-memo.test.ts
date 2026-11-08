import { describe, expect, it } from 'vitest';
import { MAX_MUXED_ID } from '../address/muxed.js';
import { invoiceMemo, parseInvoiceMemo } from './invoice-memo.js';
import { validateMemo } from './memo.js';

describe('invoiceMemo', () => {
  it('encodes the payment reference id', () => {
    expect(invoiceMemo(42n)).toBe('INV42');
  });

  it('always fits a text memo, even for the largest uint64', () => {
    expect(validateMemo({ type: 'text', value: invoiceMemo(MAX_MUXED_ID) })).toBeNull();
  });

  it('parses memos back, tolerating case and whitespace', () => {
    expect(parseInvoiceMemo('INV42')).toBe(42n);
    expect(parseInvoiceMemo(' inv42 ')).toBe(42n);
    expect(parseInvoiceMemo(invoiceMemo(MAX_MUXED_ID))).toBe(MAX_MUXED_ID);
  });

  it('rejects memos that are not invoice references', () => {
    for (const m of ['INV', 'INV-42', 'PO42', 'INV42x', '']) expect(parseInvoiceMemo(m)).toBeNull();
  });
});
