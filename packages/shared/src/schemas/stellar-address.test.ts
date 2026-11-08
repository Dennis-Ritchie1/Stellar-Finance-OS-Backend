import { describe, expect, it } from 'vitest';
import { MuxedAddressSchema, PublicKeySchema } from './stellar-address.js';

describe('Stellar address schemas', () => {
  it('accepts well-shaped G and M addresses', () => {
    expect(PublicKeySchema.safeParse('G' + 'A'.repeat(55)).success).toBe(true);
    expect(MuxedAddressSchema.safeParse('M' + 'A'.repeat(68)).success).toBe(true);
  });

  it('rejects secret keys and wrong lengths', () => {
    expect(PublicKeySchema.safeParse('S' + 'A'.repeat(55)).success).toBe(false);
    expect(PublicKeySchema.safeParse('GABC').success).toBe(false);
  });
});
