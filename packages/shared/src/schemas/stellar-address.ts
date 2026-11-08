import { z } from 'zod';

/** Shape-only checks; full checksum validation lives in @finance-os/stellar. */
export const PublicKeySchema = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Expected a Stellar public key (G...)');

export const MuxedAddressSchema = z
  .string()
  .regex(/^M[A-Z2-7]{68}$/, 'Expected a Stellar muxed address (M...)');

export const ContractIdSchema = z
  .string()
  .regex(/^C[A-Z2-7]{55}$/, 'Expected a Soroban contract id (C...)');
