import { z } from 'zod';

export const TransactionStatusSchema = z.enum(['success', 'failed']);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
export const TransactionStatusValues = TransactionStatusSchema.options;
