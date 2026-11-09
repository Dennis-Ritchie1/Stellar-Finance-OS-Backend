/**
 * Horizon paging tokens for the payments endpoint are operation ids (TOIDs):
 * decimal strings that sort numerically in ledger order. They exceed
 * Number.MAX_SAFE_INTEGER, so always compare as BigInt.
 */
export function isAfter(candidate: string, current: string | null | undefined): boolean {
  if (current === null || current === undefined) return true;
  return BigInt(candidate) > BigInt(current);
}

/**
 * Paging token that sits just before the first operation of `ledger`
 * (cursors are exclusive). Ledger n's operations have TOIDs above `n << 32`.
 */
export function ledgerToCursor(ledger: number): string {
  if (!Number.isSafeInteger(ledger) || ledger < 1) throw new Error(`invalid ledger: ${ledger}`);
  return (BigInt(ledger) << 32n).toString();
}

/** Resolve `--from`: undefined, a raw paging token, or `ledger:<n>`. */
export function resolveFrom(from: string | undefined): string | undefined {
  if (from === undefined) return undefined;
  const ledger = /^ledger:(\d+)$/.exec(from);
  if (ledger) return ledgerToCursor(Number(ledger[1]));
  if (/^\d+$/.test(from)) return from;
  throw new Error(`--from must be a paging token or ledger:<n>, got "${from}"`);
}
