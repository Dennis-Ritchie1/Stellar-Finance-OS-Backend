/** Anything Prisma returns for a Decimal column (decimal.js-compatible). */
export interface DecimalLike {
  toFixed(dp: number): string;
}

/** Decimal → 7-place string. Never goes through a JS number (AGENTS.md #2). */
export const amount = (d: DecimalLike): string => d.toFixed(7);

export const amountOrNull = (d: DecimalLike | null): string | null => (d ? amount(d) : null);

export const iso = (d: Date): string => d.toISOString();

export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** @db.Date columns → YYYY-MM-DD. */
export const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
