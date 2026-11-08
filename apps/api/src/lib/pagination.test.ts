import { describe, expect, it } from 'vitest';
import { pageArgs, toPage } from './pagination.js';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

describe('pagination', () => {
  it('asks for one extra row and skips the cursor row', () => {
    expect(pageArgs({ limit: 10 })).toEqual({ take: 11, orderBy: { id: 'desc' } });
    expect(pageArgs({ limit: 10, cursor: 'abc' })).toEqual({
      take: 11,
      orderBy: { id: 'desc' },
      cursor: { id: 'abc' },
      skip: 1,
    });
  });

  it('returns a next cursor only when more rows exist', () => {
    expect(toPage(rows(3), 3, (r) => r.id)).toEqual({
      items: ['id-0', 'id-1', 'id-2'],
      nextCursor: null,
    });
    expect(toPage(rows(4), 3, (r) => r.id)).toEqual({
      items: ['id-0', 'id-1', 'id-2'],
      nextCursor: 'id-2',
    });
  });
});
