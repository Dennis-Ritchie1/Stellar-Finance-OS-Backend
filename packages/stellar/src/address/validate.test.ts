import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { deriveMuxedAddress } from './muxed.js';
import { isValidDestination, isValidMuxedAddress, isValidPublicKey } from './validate.js';

const G = Keypair.random().publicKey();

describe('address validation', () => {
  it('accepts a real public key and rejects a bad checksum', () => {
    expect(isValidPublicKey(G)).toBe(true);
    const flipped = G.slice(0, -1) + (G.endsWith('A') ? 'B' : 'A');
    expect(isValidPublicKey(flipped)).toBe(false);
    expect(isValidPublicKey('G' + 'A'.repeat(55))).toBe(false);
  });

  it('accepts muxed addresses only as muxed', () => {
    const m = deriveMuxedAddress(G, 42n);
    expect(isValidMuxedAddress(m)).toBe(true);
    expect(isValidPublicKey(m)).toBe(false);
    expect(isValidDestination(m)).toBe(true);
    expect(isValidDestination(G)).toBe(true);
  });

  it('never treats a secret key as an address', () => {
    const secret = Keypair.random().secret();
    expect(isValidDestination(secret)).toBe(false);
  });
});
