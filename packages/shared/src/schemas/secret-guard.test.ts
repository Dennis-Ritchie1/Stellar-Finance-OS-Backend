import { describe, expect, it } from 'vitest';
import { containsSecretKey } from './secret-guard.js';

const FAKE_SECRET = 'S' + 'A'.repeat(55);
const FAKE_PUBLIC = 'G' + 'A'.repeat(55);

describe('containsSecretKey', () => {
  it('detects secret keys in strings, arrays and nested objects', () => {
    expect(containsSecretKey(FAKE_SECRET)).toBe(true);
    expect(containsSecretKey([1, FAKE_SECRET])).toBe(true);
    expect(containsSecretKey({ a: { b: FAKE_SECRET } })).toBe(true);
  });

  it('ignores public keys and other values', () => {
    expect(containsSecretKey(FAKE_PUBLIC)).toBe(false);
    expect(containsSecretKey({ n: 1, s: 'hello' })).toBe(false);
    expect(containsSecretKey(null)).toBe(false);
  });
});
