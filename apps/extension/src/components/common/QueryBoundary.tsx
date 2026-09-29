import { useEffect, useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Callout, ErrorState, SkeletonRows } from '@polymirror/ui';
import { isApiError } from '../../services/apiClient';

export function errorTitle(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong';
  switch (error.kind) {
    case 'timeout':
      return 'Request timed out';
    case 'network':
      return 'Server unreachable';
    case 'rate-limit':
      return 'Too many requests';
    case 'auth':
      return 'Session problem';
    case 'not-found':
      return 'Not found';
    case 'validation':
      return 'Invalid request';
    case 'limit-violation':
      return 'Limit violation';
    default:
      return 'Server error';
  }
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

/** "Too many requests, retrying in Ns" — counts down from the server's Retry-After. */
export function RateLimitNotice({ error }: { error: unknown }) {
  const retryAfterMs = isApiError(error) ? error.retryAfterMs : undefined;
  const [deadline] = useState(() => Date.now() + (retryAfterMs ?? 0));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <Callout variant="warning" role="status">
      {retryAfterMs !== undefined
        ? `Too many requests, retrying in ${secs}s`
        : 'Too many requests, retrying shortly…'}
    </Callout>
  );
}

export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
}

/**
 * Renders the standard states of a query: loading (skeleton), rate-limited retry notice,
 * error (with retry), empty and success.
 */
export function QueryBoundary<T>({ query, children, skeleton, isEmpty, empty }: QueryBoundaryProps<T>) {
  const rateLimited =
    query.isFetching && isApiError(query.failureReason) && query.failureReason.kind === 'rate-limit';

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {rateLimited ? <RateLimitNotice key={query.failureCount} error={query.failureReason} /> : null}
        {skeleton ?? <SkeletonRows rows={5} />}
      </div>
    );
  }
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        title={errorTitle(query.error)}
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const data = query.data as T;
  return (
    <div className="flex flex-col gap-3">
      {rateLimited ? <RateLimitNotice key={query.failureCount} error={query.failureReason} /> : null}
      {query.isError ? (
        <Callout variant="warning" role="status">
          Showing cached data — {errorMessage(query.error)}{' '}
          <button type="button" className="cursor-pointer underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </Callout>
      ) : null}
      {isEmpty?.(data) ? empty : children(data)}
    </div>
  );
}
