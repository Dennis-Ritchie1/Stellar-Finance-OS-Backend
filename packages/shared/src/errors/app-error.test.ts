import { describe, expect, it } from 'vitest';
import { AppError } from './app-error.js';
import { forbidden, isAppError, notFound } from './factories.js';

describe('AppError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(new AppError('CONFLICT', 'x').statusCode).toBe(409);
    expect(notFound('Invoice').statusCode).toBe(404);
    expect(forbidden().statusCode).toBe(403);
  });

  it('formats not-found messages', () => {
    expect(notFound('Invoice').message).toBe('Invoice not found');
  });

  it('is detectable via isAppError', () => {
    expect(isAppError(notFound('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
