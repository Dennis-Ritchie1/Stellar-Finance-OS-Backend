import { MemberRoleValues } from '@finance-os/shared';
import { describe, expect, it } from 'vitest';
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, type Permission } from './permissions.js';

describe('role permission matrix', () => {
  it('defines every role', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...MemberRoleValues].sort());
  });

  it('lets every role read the org and its members', () => {
    for (const role of MemberRoleValues) {
      expect(hasPermission(role, 'org:read')).toBe(true);
      expect(hasPermission(role, 'members:read')).toBe(true);
    }
  });

  it('grants owners and admins everything', () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission('owner', p)).toBe(true);
      expect(hasPermission('admin', p)).toBe(true);
    }
  });

  it.each<[Permission, string[]]>([
    ['org:update', ['owner', 'admin']],
    ['members:manage', ['owner', 'admin']],
    ['approval_policies:manage', ['owner', 'admin']],
    ['treasury:manage', ['owner', 'admin']],
    ['payment_requests:approve', ['owner', 'admin', 'approver']],
    ['payment_requests:create', ['owner', 'admin', 'accountant']],
    ['invoices:write', ['owner', 'admin', 'accountant']],
    ['transactions:match', ['owner', 'admin', 'accountant']],
  ])('%s is granted to exactly %j', (permission, roles) => {
    const granted = MemberRoleValues.filter((r) => hasPermission(r, permission));
    expect(granted.sort()).toEqual([...roles].sort());
  });

  it('gives viewers read-only access', () => {
    expect([...ROLE_PERMISSIONS.viewer].sort()).toEqual(['members:read', 'org:read']);
  });
});
