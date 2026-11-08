import { describe, expect, it } from 'vitest';
import { parseBackfillArgs } from './backfill-args.js';

const ACCOUNT = 'G' + 'A'.repeat(55);

describe('parseBackfillArgs', () => {
  it('parses account and cursor', () => {
    expect(parseBackfillArgs(['--account', ACCOUNT, '--from', '123'])).toEqual({
      account: ACCOUNT,
      from: '123',
    });
  });

  it('makes --from optional', () => {
    expect(parseBackfillArgs(['--account', ACCOUNT])).toEqual({ account: ACCOUNT });
  });

  it('rejects a missing or malformed account', () => {
    expect(() => parseBackfillArgs([])).toThrow();
    expect(() => parseBackfillArgs(['--account', 'S' + 'A'.repeat(55)])).toThrow();
  });
});
