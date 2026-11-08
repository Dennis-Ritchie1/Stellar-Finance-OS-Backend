const hasCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === code;

/** Prisma unique-constraint violation. */
export const isUniqueViolation = (err: unknown) => hasCode(err, 'P2002');

/** Prisma foreign-key violation (e.g. deleting a row still referenced with RESTRICT). */
export const isForeignKeyViolation = (err: unknown) => hasCode(err, 'P2003');
