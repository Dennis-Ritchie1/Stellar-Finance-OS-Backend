import { z } from 'zod';

export const MemberRoleSchema = z.enum(['owner', 'admin', 'approver', 'accountant', 'viewer']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export const MemberRoleValues = MemberRoleSchema.options;
