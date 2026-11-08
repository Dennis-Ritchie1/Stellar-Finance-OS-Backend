import { z } from 'zod';
import { STELLAR_DECIMALS } from './constants.js';

/** A non-negative decimal string with up to 7 fractional digits, e.g. "125.5000000". */
export const AMOUNT_REGEX = new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${STELLAR_DECIMALS}})?$`);

export const AmountSchema = z
  .string()
  .regex(AMOUNT_REGEX, 'Amount must be a decimal string with at most 7 decimal places');

export type Amount = z.infer<typeof AmountSchema>;

export function isValidAmount(value: string): boolean {
  return AMOUNT_REGEX.test(value);
}
