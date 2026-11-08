import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  amountsEqual,
  compareAmounts,
  isZeroAmount,
  multiplyAmounts,
  normalizeAmount,
  subtractAmounts,
} from './arithmetic.js';

describe('money arithmetic', () => {
  it('avoids float rounding errors', () => {
    // 0.1 + 0.2 !== 0.3 in JS floats
    expect(addAmounts('0.1', '0.2')).toBe('0.3000000');
  });

  it('adds many amounts', () => {
    expect(addAmounts('1', '2.5', '0.0000001')).toBe('3.5000001');
    expect(addAmounts()).toBe('0.0000000');
  });

  it('subtracts exactly', () => {
    expect(subtractAmounts('100', '99.9999999')).toBe('0.0000001');
  });

  it('throws on underflow', () => {
    expect(() => subtractAmounts('1', '2')).toThrow(RangeError);
  });

  it('compares amounts regardless of formatting', () => {
    expect(compareAmounts('1.0', '1')).toBe(0);
    expect(compareAmounts('1', '2')).toBe(-1);
    expect(compareAmounts('2', '1')).toBe(1);
    expect(amountsEqual('5.50', '5.5000000')).toBe(true);
  });

  it('normalizes and detects zero', () => {
    expect(normalizeAmount('5')).toBe('5.0000000');
    expect(isZeroAmount('0.0000000')).toBe(true);
    expect(isZeroAmount('0.0000001')).toBe(false);
  });

  it('multiplies exactly and truncates to 7 places', () => {
    expect(multiplyAmounts('2', '125.5')).toBe('251.0000000');
    expect(multiplyAmounts('0.1', '0.2')).toBe('0.0200000');
    expect(multiplyAmounts('0.0000001', '0.5')).toBe('0.0000000');
    expect(multiplyAmounts('3', '0.3333333')).toBe('0.9999999');
  });
});
