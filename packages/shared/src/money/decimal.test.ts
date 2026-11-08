import { describe, expect, it } from 'vitest';
import { Decimal } from './decimal.js';

describe('Decimal', () => {
  it('handles Decimal(38,7) values exactly', () => {
    const big = new Decimal('9999999999999999999999999999999.9999999');
    expect(big.plus('0.0000001').toFixed(7)).toBe('10000000000000000000000000000000.0000000');
  });

  it('rounds down by default', () => {
    expect(new Decimal('1').div(3).toDecimalPlaces(7).toFixed(7)).toBe('0.3333333');
  });
});
