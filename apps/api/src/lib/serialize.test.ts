import { Decimal } from '@finance-os/shared';
import { describe, expect, it } from 'vitest';
import { amount, amountOrNull, dateOnly, isoOrNull } from './serialize.js';

describe('serialize', () => {
  it('renders decimals with exactly 7 places and no float rounding', () => {
    expect(amount(new Decimal('0.1').plus('0.2'))).toBe('0.3000000');
    expect(amount(new Decimal('922337203685.4775807'))).toBe('922337203685.4775807');
    expect(amountOrNull(null)).toBeNull();
  });

  it('renders dates', () => {
    expect(dateOnly(new Date('2026-03-04T00:00:00Z'))).toBe('2026-03-04');
    expect(isoOrNull(null)).toBeNull();
  });
});
