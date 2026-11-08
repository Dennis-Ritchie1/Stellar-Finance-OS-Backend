import { z } from 'zod';

export const IdSchema = z.uuid();
export const OrgParamsSchema = z.object({ orgId: IdSchema });
export const OrgResourceParamsSchema = OrgParamsSchema.extend({ id: IdSchema });
