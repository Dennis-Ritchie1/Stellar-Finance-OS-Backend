import { describe, expect, it } from 'vitest';
import { AmountSchema, isValidAmount } from './amount.js';

describe('isValidAmount', () => {
  it.each(['0', '1', '10.5', '0.0000001', '922337203685.4775807'])('accepts %s', (v) => {
    expect(isValidAmount(v)).toBe(true);
  });

  it.each(['', '-1', '01', '1.', '.5', '1.00000001', '1e5', 'abc', ' 1'])('rejects %j', (v) => {
    expect(isValidAmount(v)).toBe(false);
  });

  it('AmountSchema rejects numbers', () => {
    expect(AmountSchema.safeParse(1.5).success).toBe(false);
  });
});
