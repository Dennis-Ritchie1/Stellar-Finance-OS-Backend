import { conflict, forbidden, type MemberRole } from '@finance-os/shared';

/**
 * Who may change whom. Callers already hold `members:manage` (owner/admin).
 * - Only owners may create, modify or remove an owner.
 * - An org must always keep at least one owner.
 *
 * `from` is the target's current role (null when adding); `to` is the new role
 * (null when removing). `ownerCount` is the org's current number of owners.
 */
export function assertMemberChangeAllowed(args: {
  actorRole: MemberRole;
  from: MemberRole | null;
  to: MemberRole | null;
  ownerCount: number;
}): void {
  const { actorRole, from, to, ownerCount } = args;
  const touchesOwner = from === 'owner' || to === 'owner';
  if (touchesOwner && actorRole !== 'owner') {
    throw forbidden('Only owners can add, change or remove owners');
  }
  if (from === 'owner' && to !== 'owner' && ownerCount <= 1) {
    throw conflict('An organization must keep at least one owner');
  }
}
