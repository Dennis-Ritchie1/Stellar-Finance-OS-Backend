import { describe, expect, it } from 'vitest';
import { randomToken } from './token.js';

describe('randomToken', () => {
  it('is url-safe and the expected length', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(32)).toHaveLength(43);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => randomToken()));
    expect(seen.size).toBe(1000);
  });
});
