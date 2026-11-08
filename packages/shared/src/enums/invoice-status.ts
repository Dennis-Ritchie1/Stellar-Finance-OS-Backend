import { z } from 'zod';

export const InvoiceStatusSchema = z.enum([
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export const InvoiceStatusValues = InvoiceStatusSchema.options;
