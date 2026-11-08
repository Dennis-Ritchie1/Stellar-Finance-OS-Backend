import { z } from 'zod';

export const TransactionDirectionSchema = z.enum(['in', 'out']);
export type TransactionDirection = z.infer<typeof TransactionDirectionSchema>;
export const TransactionDirectionValues = TransactionDirectionSchema.options;
