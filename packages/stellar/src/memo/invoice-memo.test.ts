import { describe, expect, it } from 'vitest';
import { invoiceMemo } from './invoice-memo.js';
import { validateMemo } from './memo.js';

describe('invoiceMemo', () => {
  it('uses the numeric tail of the invoice number', () => {
    expect(invoiceMemo('INV-2026-0042')).toBe('INV0042');
  });

  it('always yields a valid text memo, even for long numbers', () => {
    const memo = invoiceMemo('X'.repeat(60));
    expect(validateMemo({ type: 'text', value: memo })).toBeNull();
  });
});
