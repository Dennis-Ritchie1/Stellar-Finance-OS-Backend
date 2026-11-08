import { z } from 'zod';

export const OperationTypeSchema = z.enum([
  'payment',
  'path_payment_strict_receive',
  'path_payment_strict_send',
  'claimable_balance_claim',
  'account_merge',
  'contract_transfer',
]);
export type OperationType = z.infer<typeof OperationTypeSchema>;
export const OperationTypeValues = OperationTypeSchema.options;
