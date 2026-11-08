import { z } from 'zod';

export const MatchMethodSchema = z.enum(['muxed', 'memo', 'contract_event', 'manual']);
export type MatchMethod = z.infer<typeof MatchMethodSchema>;
export const MatchMethodValues = MatchMethodSchema.options;
