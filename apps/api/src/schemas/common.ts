import { z } from 'zod';

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Standard error responses, spread into a route's `response` map. */
export const errorResponses = (...codes: Array<400 | 401 | 403 | 404 | 409>) =>
  Object.fromEntries(codes.map((c) => [c, ErrorResponse])) as Record<number, typeof ErrorResponse>;

/** Timestamps cross the wire as ISO-8601 strings. */
export const DateTimeString = z.iso.datetime();

/** Normalised (trimmed, lowercased) before validation so lookups are case-insensitive. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Mark a route as requiring `Authorization: Bearer <token>` in OpenAPI. */
export const bearerSecurity = [{ bearerAuth: [] }];
