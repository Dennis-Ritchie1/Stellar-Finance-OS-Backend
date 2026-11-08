import { EnvSchema, type Env } from './env.schema.js';

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/** Parse and validate an env record. Pure — does not read process.env itself. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}
