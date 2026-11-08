import { StrKey } from '@stellar/stellar-sdk';

/** Full checksum validation of a G... public key (shape checks live in shared). */
export function isValidPublicKey(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/** Full checksum validation of an M... muxed address. */
export function isValidMuxedAddress(address: string): boolean {
  return StrKey.isValidMed25519PublicKey(address);
}

/** A destination we can pay: a G... or M... address. */
export function isValidDestination(address: string): boolean {
  return isValidPublicKey(address) || isValidMuxedAddress(address);
}
