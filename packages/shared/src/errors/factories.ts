import { AppError } from './app-error.js';

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'Forbidden') => new AppError('FORBIDDEN', message);
export const unauthorized = (message = 'Unauthorized') => new AppError('UNAUTHORIZED', message);
export const conflict = (message: string) => new AppError('CONFLICT', message);
export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', message, details);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
