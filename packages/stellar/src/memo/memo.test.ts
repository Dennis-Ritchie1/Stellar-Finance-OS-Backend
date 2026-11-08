import { describe, expect, it } from 'vitest';
import { fromSdkMemo, memosEqual, toSdkMemo, validateMemo, type MemoValue } from './memo.js';

const HASH = 'ab'.repeat(32);

describe('memo helpers', () => {
  it.each<MemoValue>([
    { type: 'none' },
    { type: 'text', value: 'INV0042' },
    { type: 'id', value: '18446744073709551615' },
    { type: 'hash', value: HASH },
    { type: 'return', value: HASH },
  ])('round-trips %j', (memo) => {
    const back = fromSdkMemo(toSdkMemo(memo));
    expect(memosEqual(back, memo)).toBe(true);
  });

  it.each<[MemoValue, RegExp]>([
    [{ type: 'text', value: 'x'.repeat(29) }, /28 bytes/],
    [{ type: 'text', value: '' }, /empty/],
    [{ type: 'id', value: '-1' }, /unsigned/],
    [{ type: 'id', value: '18446744073709551616' }, /uint64/],
    [{ type: 'hash', value: 'nothex' }, /32 bytes/],
    [{ type: 'none', value: 'x' }, /none/],
  ])('rejects %j', (memo, msg) => {
    expect(validateMemo(memo)).toMatch(msg);
    expect(() => toSdkMemo(memo)).toThrow(msg);
  });

  it('counts text length in bytes, not characters', () => {
    expect(validateMemo({ type: 'text', value: 'é'.repeat(14) })).toBeNull();
    expect(validateMemo({ type: 'text', value: 'é'.repeat(15) })).not.toBeNull();
  });

  it('compares hash memos case-insensitively but types strictly', () => {
    expect(
      memosEqual({ type: 'hash', value: HASH.toUpperCase() }, { type: 'hash', value: HASH }),
    ).toBe(true);
    expect(memosEqual({ type: 'text', value: '1' }, { type: 'id', value: '1' })).toBe(false);
  });
});
