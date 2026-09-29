import type { ApiErrorCode, LimitCheck } from '@polymirror/shared';

export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', 400, message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError('UNAUTHORIZED', 401, message);
export const forbidden = (message = 'Forbidden') => new AppError('FORBIDDEN', 403, message);
export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', 404, message);
export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', 409, message, details);
export const limitViolation = (message: string, checks: LimitCheck[]) =>
  new AppError('LIMIT_VIOLATION', 422, message, checks);

/** Failure talking to Polymarket (or another upstream). */
export class UpstreamError extends AppError {
  constructor(
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super('UPSTREAM_ERROR', 502, message);
    this.name = 'UpstreamError';
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor(message = 'Upstream request timed out') {
    super('UPSTREAM_TIMEOUT', 504, message);
    this.name = 'UpstreamTimeoutError';
  }
}
