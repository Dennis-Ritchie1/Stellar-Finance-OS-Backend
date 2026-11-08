import { EnvSchema, type Env } from './env.schema.js';
import { findEnvFile } from './find-env-file.js';

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

let cached: Env | undefined;

/** Load `.env` (if present) into process.env, validate, and memoise. */
export async function loadEnv(): Promise<Env> {
  if (cached) return cached;
  const { config } = await import('dotenv');
  const path = findEnvFile();
  if (path) config({ path, quiet: true });
  cached = parseEnv(process.env);
  return cached;
}
