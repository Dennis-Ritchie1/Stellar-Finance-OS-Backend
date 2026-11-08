import { z } from 'zod';

export const ApprovalDecisionSchema = z.enum(['approved', 'rejected']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export const ApprovalDecisionValues = ApprovalDecisionSchema.options;
