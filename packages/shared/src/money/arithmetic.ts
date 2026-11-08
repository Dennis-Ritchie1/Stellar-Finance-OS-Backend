import { fromStroops, toStroops } from './stroops.js';

/** Normalise an amount to 7 decimal places, e.g. "5" -> "5.0000000". */
export function normalizeAmount(amount: string): string {
  return fromStroops(toStroops(amount));
}

export function addAmounts(...amounts: string[]): string {
  return fromStroops(amounts.reduce((sum, a) => sum + toStroops(a), 0n));
}

/** a - b. Throws if the result would be negative. */
export function subtractAmounts(a: string, b: string): string {
  const diff = toStroops(a) - toStroops(b);
  if (diff < 0n) {
    throw new RangeError(`Subtraction underflow: ${a} - ${b}`);
  }
  return fromStroops(diff);
}

export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  const x = toStroops(a);
  const y = toStroops(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

export function amountsEqual(a: string, b: string): boolean {
  return compareAmounts(a, b) === 0;
}

export function isZeroAmount(a: string): boolean {
  return toStroops(a) === 0n;
}
