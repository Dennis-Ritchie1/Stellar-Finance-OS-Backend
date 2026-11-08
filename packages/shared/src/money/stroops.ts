import { isValidAmount } from './amount.js';
import { MAX_STROOPS, STELLAR_DECIMALS, STROOPS_PER_UNIT } from './constants.js';

/** Convert a decimal amount string to integer stroops without touching floats. */
export function toStroops(amount: string): bigint {
  if (!isValidAmount(amount)) {
    throw new RangeError(`Invalid amount: ${amount}`);
  }
  const [whole = '0', frac = ''] = amount.split('.');
  const stroops = BigInt(whole) * STROOPS_PER_UNIT + BigInt(frac.padEnd(STELLAR_DECIMALS, '0'));
  if (stroops > MAX_STROOPS) {
    throw new RangeError(`Amount exceeds Stellar maximum: ${amount}`);
  }
  return stroops;
}

/** Convert integer stroops to a canonical 7-decimal amount string. */
export function fromStroops(stroops: bigint): string {
  if (stroops < 0n) {
    throw new RangeError('Stroops must be non-negative');
  }
  const whole = stroops / STROOPS_PER_UNIT;
  const frac = (stroops % STROOPS_PER_UNIT).toString().padStart(STELLAR_DECIMALS, '0');
  return `${whole}.${frac}`;
}
