import type { Tx } from './types.js';

interface ApprovalSeedContext {
  organizationId: string;
  membersByRole: Map<string, string[]>;
  vendorIds: string[];
  treasuryAccountId: string;
  usdcIssuer: string | null;
}

/** 2-of-N approvals for payments above 1,000 (README §4 example). */
export async function seedApprovalPolicy(tx: Tx, ctx: ApprovalSeedContext) {
  const approverIds = [
    ...(ctx.membersByRole.get('owner') ?? []),
    ...(ctx.membersByRole.get('approver') ?? []),
  ];
  return tx.approvalPolicy.create({
    data: {
      organizationId: ctx.organizationId,
      name: 'Large payments need 2 approvals',
      threshold: 2,
      amountAbove: '1000',
      assetCode: 'USDC',
      approvers: { create: approverIds.map((memberId) => ({ memberId })) },
    },
  });
}

/** A payment request awaiting approval, with one of two approvals already in. */
export async function seedPendingPaymentRequest(tx: Tx, ctx: ApprovalSeedContext) {
  const accountant = ctx.membersByRole.get('accountant')![0]!;
  const firstApprover = ctx.membersByRole.get('approver')![0]!;
  return tx.paymentRequest.create({
    data: {
      organizationId: ctx.organizationId,
      vendorId: ctx.vendorIds[0]!,
      createdByMemberId: accountant,
      sourceTreasuryAccountId: ctx.treasuryAccountId,
      assetCode: 'USDC',
      assetIssuer: ctx.usdcIssuer,
      amount: '1250',
      reason: 'Cloud hosting — Q4',
      status: 'pending_approval',
      approvals: {
        create: {
          organizationId: ctx.organizationId,
          memberId: firstApprover,
          decision: 'approved',
          comment: 'Matches the contract.',
        },
      },
    },
  });
}
