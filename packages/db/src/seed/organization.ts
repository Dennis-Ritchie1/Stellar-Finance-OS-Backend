import { DEMO_ORG, DEMO_USERS } from './data.js';
import type { Tx } from './types.js';

export interface SeededOrg {
  organizationId: string;
  /** role → member ids, in DEMO_USERS order. */
  membersByRole: Map<string, string[]>;
}

export async function seedOrganization(tx: Tx, userIds: Map<string, string>): Promise<SeededOrg> {
  const org = await tx.organization.create({ data: { name: DEMO_ORG.name, slug: DEMO_ORG.slug } });
  const membersByRole = new Map<string, string[]>();
  for (const u of DEMO_USERS) {
    const member = await tx.member.create({
      data: { organizationId: org.id, userId: userIds.get(u.email)!, role: u.role },
    });
    membersByRole.set(u.role, [...(membersByRole.get(u.role) ?? []), member.id]);
  }
  return { organizationId: org.id, membersByRole };
}
