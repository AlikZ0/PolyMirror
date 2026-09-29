import { QueryClient } from '@tanstack/react-query';
import { isApiError, NON_RETRYABLE } from './apiClient';

const MAX_RETRIES = 3;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && NON_RETRYABLE.has(error.kind)) return false;
  return failureCount < MAX_RETRIES;
}

export function retryDelay(attempt: number, error: unknown): number {
  if (isApiError(error) && error.kind === 'rate-limit' && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, 60_000);
  }
  return Math.min(1_000 * 2 ** attempt, 15_000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 15_000,
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Financial and settings mutations are never retried automatically.
        retry: false,
      },
    },
  });
}
