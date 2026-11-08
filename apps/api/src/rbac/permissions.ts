import type { MemberRole } from '@finance-os/shared';

/**
 * Role → permission matrix. Route guards check permissions, never role names,
 * so adjusting what a role may do is a one-line change here.
 */
export const PERMISSIONS = [
  'org:read',
  'org:update',
  'members:read',
  'members:manage',
  'treasury:manage',
  'clients:write',
  'invoices:write',
  'vendors:write',
  'payment_requests:create',
  'payment_requests:approve',
  'payment_requests:submit',
  'transactions:match',
  'exports:create',
  'approval_policies:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = ['org:read', 'members:read'];

const BOOKKEEPING: Permission[] = [
  'clients:write',
  'invoices:write',
  'vendors:write',
  'payment_requests:create',
  'transactions:match',
  'exports:create',
];

export const ROLE_PERMISSIONS: Record<MemberRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set(PERMISSIONS),
  approver: new Set([...READ, 'payment_requests:approve', 'payment_requests:submit']),
  accountant: new Set([...READ, ...BOOKKEEPING]),
  viewer: new Set(READ),
};

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
