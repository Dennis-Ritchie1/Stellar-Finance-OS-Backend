import { z } from 'zod';

export const ExportStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type ExportStatus = z.infer<typeof ExportStatusSchema>;
export const ExportStatusValues = ExportStatusSchema.options;
