import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { baseAccountOf, decodeMuxedAddress, deriveMuxedAddress, MAX_MUXED_ID } from './muxed.js';

const G = Keypair.random().publicKey();

describe('muxed addresses', () => {
  it.each([0n, 1n, 42n, 2n ** 53n + 1n, MAX_MUXED_ID])('round-trips id %s', (id) => {
    const m = deriveMuxedAddress(G, id);
    expect(m).toMatch(/^M[A-Z2-7]{68}$/);
    expect(decodeMuxedAddress(m)).toEqual({ baseAddress: G, id: id.toString() });
  });

  it('gives different invoices different addresses on the same treasury', () => {
    expect(deriveMuxedAddress(G, 1n)).not.toBe(deriveMuxedAddress(G, 2n));
  });

  it('rejects ids outside uint64', () => {
    expect(() => deriveMuxedAddress(G, -1n)).toThrow(RangeError);
    expect(() => deriveMuxedAddress(G, MAX_MUXED_ID + 1n)).toThrow(RangeError);
  });

  it('resolves the base account of G and M addresses', () => {
    expect(baseAccountOf(G)).toBe(G);
    expect(baseAccountOf(deriveMuxedAddress(G, 7n))).toBe(G);
  });
});
