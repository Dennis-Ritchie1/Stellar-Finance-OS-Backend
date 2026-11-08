import { describe, expect, it } from 'vitest';
import { parseOperationId } from './operation-id.js';

const toid = (ledger: bigint, tx: bigint, op: bigint) =>
  ((ledger << 32n) | (tx << 12n) | op).toString();

describe('parseOperationId', () => {
  it('extracts ledger and zero-based operation index', () => {
    expect(parseOperationId(toid(123456n, 7n, 1n))).toEqual({ ledger: 123456, operationIndex: 0 });
    expect(parseOperationId(toid(50_000_000n, 1n, 100n))).toEqual({
      ledger: 50_000_000,
      operationIndex: 99,
    });
  });

  it('parses a real testnet operation id', () => {
    // ledger 1 of a TOID: 4294971393 = 1<<32 | 1<<12 | 1
    expect(parseOperationId('4294971393')).toEqual({ ledger: 1, operationIndex: 0 });
  });
});
