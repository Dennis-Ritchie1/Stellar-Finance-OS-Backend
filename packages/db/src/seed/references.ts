import { randomBytes } from 'node:crypto';
import { Account, MuxedAccount } from '@stellar/stellar-sdk';

/** M... address = treasury G-address + invoice paymentRefId (README §5.1). */
export function deriveMuxedAddress(treasuryAddress: string, paymentRefId: bigint): string {
  return new MuxedAccount(new Account(treasuryAddress, '0'), paymentRefId.toString()).accountId();
}

/** Short MEMO_TEXT fallback, e.g. INV-2026-0042 → INV0042 (README §5.2). */
export function invoiceMemo(invoiceNumber: string): string {
  const tail = invoiceNumber.split('-').at(-1) ?? invoiceNumber;
  return `INV${tail}`;
}

export function newPublicToken(): string {
  return randomBytes(24).toString('base64url');
}
