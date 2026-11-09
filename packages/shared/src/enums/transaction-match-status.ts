import { z } from 'zod';

/** Outcome recorded on a Transaction the matcher could not settle automatically. */
export const TransactionMatchStatusSchema = z.enum(['suggested', 'flagged']);
export type TransactionMatchStatus = z.infer<typeof TransactionMatchStatusSchema>;
export const TransactionMatchStatusValues = TransactionMatchStatusSchema.options;
