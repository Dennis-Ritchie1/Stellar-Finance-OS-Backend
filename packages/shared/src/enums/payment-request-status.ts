import { z } from 'zod';

export const PaymentRequestStatusSchema = z.enum(['draft', 'pending_approval', 'approved', 'submitted', 'settled', 'rejected', 'failed']);
export type PaymentRequestStatus = z.infer<typeof PaymentRequestStatusSchema>;
export const PaymentRequestStatusValues = PaymentRequestStatusSchema.options;
