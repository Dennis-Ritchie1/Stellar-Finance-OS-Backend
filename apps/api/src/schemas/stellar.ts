import { isValidDestination, isValidPublicKey } from '@finance-os/stellar';
import { z } from 'zod';

/** A G... public key with a valid checksum. */
export const PublicKeyInput = z
  .string()
  .trim()
  .refine(isValidPublicKey, 'Expected a valid Stellar public key (G...)');

/** A G... or M... address with a valid checksum. */
export const DestinationInput = z
  .string()
  .trim()
  .refine(isValidDestination, 'Expected a valid Stellar address (G... or M...)');

/** A positive decimal amount with at most 7 places, as a string. */
export const PositiveAmountInput = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,7})?$/, 'Decimal string with at most 7 decimal places')
  .refine((v) => /[1-9]/.test(v), 'Amount must be greater than zero');
