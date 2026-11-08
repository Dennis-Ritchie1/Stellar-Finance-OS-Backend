import { Account, MuxedAccount } from '@stellar/stellar-sdk';

/** uint64 upper bound — muxed ids are unsigned 64-bit integers. */
export const MAX_MUXED_ID = 2n ** 64n - 1n;

/**
 * M... address = treasury G-address + numeric id (README §5.1). Payments to it
 * land in the treasury account; the id tells us which invoice was paid.
 */
export function deriveMuxedAddress(baseAddress: string, id: bigint): string {
  if (id < 0n || id > MAX_MUXED_ID) throw new RangeError(`Muxed id out of uint64 range: ${id}`);
  return new MuxedAccount(new Account(baseAddress, '0'), id.toString()).accountId();
}

export interface DecodedMuxed {
  baseAddress: string;
  /** Decimal string — uint64 exceeds Number.MAX_SAFE_INTEGER. */
  id: string;
}

/** Split an M... address into its G... base and muxed id. */
export function decodeMuxedAddress(muxedAddress: string): DecodedMuxed {
  const muxed = MuxedAccount.fromAddress(muxedAddress, '0');
  return { baseAddress: muxed.baseAccount().accountId(), id: muxed.id() };
}

/** The G... account behind any address: itself for G..., the base for M.... */
export function baseAccountOf(address: string): string {
  return address.startsWith('M') ? decodeMuxedAddress(address).baseAddress : address;
}
