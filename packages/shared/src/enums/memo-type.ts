import { z } from 'zod';

export const MemoTypeSchema = z.enum(['none', 'text', 'id', 'hash', 'return']);
export type MemoType = z.infer<typeof MemoTypeSchema>;
export const MemoTypeValues = MemoTypeSchema.options;
