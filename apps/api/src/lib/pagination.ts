import { PaginationQuerySchema } from '@finance-os/shared';

export { PaginationQuerySchema };

/**
 * Keyset pagination over uuid7 ids (time-ordered). Fetch `limit + 1` rows
 * ordered by id desc; the extra row tells us whether there's a next page.
 */
export function pageArgs(query: { limit: number; cursor?: string | undefined }) {
  return {
    take: query.limit + 1,
    orderBy: { id: 'desc' as const },
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }, R>(
  rows: T[],
  limit: number,
  map: (row: T) => R,
): { items: R[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(map), nextCursor: hasMore ? page.at(-1)!.id : null };
}
