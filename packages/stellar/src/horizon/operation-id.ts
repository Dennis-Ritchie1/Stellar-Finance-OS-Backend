/**
 * Horizon operation ids are TOIDs: ledger (32 bits) | tx order (20) | op order (12).
 * Op order is 1-based within the transaction.
 */
export function parseOperationId(id: string): { ledger: number; operationIndex: number } {
  const toid = BigInt(id);
  return {
    ledger: Number(toid >> 32n),
    operationIndex: Number(toid & 0xfffn) - 1,
  };
}
