import { AppError, type MemberRole } from '@finance-os/shared';
import { describe, expect, it } from 'vitest';
import { assertMemberChangeAllowed } from './member-rules.js';

const code = (args: Parameters<typeof assertMemberChangeAllowed>[0]) => {
  try {
    assertMemberChangeAllowed(args);
    return 'ok';
  } catch (err) {
    return err instanceof AppError ? err.code : 'THREW';
  }
};

describe('assertMemberChangeAllowed', () => {
  it.each<[MemberRole, MemberRole | null, MemberRole | null, number, string]>([
    // actor, from, to, ownerCount, expected
    ['admin', null, 'viewer', 1, 'ok'],
    ['admin', 'viewer', 'accountant', 1, 'ok'],
    ['admin', 'accountant', null, 1, 'ok'],
    ['admin', null, 'owner', 1, 'FORBIDDEN'],
    ['admin', 'viewer', 'owner', 1, 'FORBIDDEN'],
    ['admin', 'owner', 'viewer', 2, 'FORBIDDEN'],
    ['admin', 'owner', null, 2, 'FORBIDDEN'],
    ['owner', null, 'owner', 1, 'ok'],
    ['owner', 'admin', 'owner', 1, 'ok'],
    ['owner', 'owner', 'admin', 2, 'ok'],
    ['owner', 'owner', null, 2, 'ok'],
    ['owner', 'owner', 'owner', 1, 'ok'],
    ['owner', 'owner', 'admin', 1, 'CONFLICT'],
    ['owner', 'owner', null, 1, 'CONFLICT'],
  ])('%s changing %s → %s with %i owner(s): %s', (actorRole, from, to, ownerCount, expected) => {
    expect(code({ actorRole, from, to, ownerCount })).toBe(expected);
  });
});
