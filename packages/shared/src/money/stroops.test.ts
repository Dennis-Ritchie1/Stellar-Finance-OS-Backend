import { describe, expect, it } from 'vitest';
import { fromStroops, toStroops } from './stroops.js';

describe('toStroops / fromStroops', () => {
  it.each([
    ['0', 0n],
    ['1', 10_000_000n],
    ['0.0000001', 1n],
    ['123.45', 1_234_500_000n],
    ['922337203685.4775807', 9_223_372_036_854_775_807n],
  ])('%s <-> %s stroops', (amount, stroops) => {
    expect(toStroops(amount)).toBe(stroops);
  });

  it('round-trips to canonical 7-decimal form', () => {
    expect(fromStroops(toStroops('123.45'))).toBe('123.4500000');
  });

  it('rejects amounts above int64 max', () => {
    expect(() => toStroops('922337203685.4775808')).toThrow(RangeError);
  });

  it('rejects invalid input', () => {
    expect(() => toStroops('1.5e3')).toThrow(RangeError);
  });

  it('rejects negative stroops', () => {
    expect(() => fromStroops(-1n)).toThrow(RangeError);
  });
});
