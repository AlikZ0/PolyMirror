import type { ApiErrorBody, ApiErrorCode, LimitCheck } from '@polymirror/shared';
import { REQUEST_TIMEOUT_MS } from '../config';

export type ApiErrorKind =
  | 'timeout'
  | 'network'
  | 'rate-limit'
  | 'auth'
  | 'validation'
  | 'limit-violation'
  | 'not-found'
  | 'conflict'
  | 'server';

/** A classified failure of a backend request, with a message safe to show to the user. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly extra: {
      status?: number;
      code?: ApiErrorCode | undefined;
      details?: unknown;
      /** For rate-limit errors: how long the server asked us to wait. */
      retryAfterMs?: number | undefined;
      serverMessage?: string | undefined;
    } = {},
  ) {
    super(message);
  }

  get status(): number | undefined {
    return this.extra.status;
  }

  get code(): ApiErrorCode | undefined {
    return this.extra.code;
  }

  get retryAfterMs(): number | undefined {
    return this.extra.retryAfterMs;
  }

  /** Failed limit checks for LIMIT_VIOLATION errors. */
  get failedChecks(): LimitCheck[] {
    if (this.kind !== 'limit-violation' || !Array.isArray(this.extra.details)) return [];
    return (this.extra.details as LimitCheck[]).filter(
      (c) => c && typeof c === 'object' && typeof c.code === 'string',
    );
  }

  /** Field → message map for validation errors, if the server sent one. */
  get fieldErrors(): Record<string, string> {
    const d = this.extra.details;
    const out: Record<string, string> = {};
    if (Array.isArray(d)) {
      for (const issue of d as Array<{ path?: unknown; message?: unknown }>) {
        const path = Array.isArray(issue?.path) ? issue.path.join('.') : String(issue?.path ?? '');
        if (path && typeof issue.message === 'string') out[path] = issue.message;
      }
    } else if (d && typeof d === 'object') {
      const fe = (d as { fieldErrors?: Record<string, unknown> }).fieldErrors ?? d;
      for (const [k, v] of Object.entries(fe as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
        else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
      }
    }
    return out;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Kinds that must never be retried automatically. */
export const NON_RETRYABLE: ReadonlySet<ApiErrorKind> = new Set([
  'auth',
  'validation',
  'limit-violation',
  'not-found',
  'conflict',
]);

/** Parses a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  return (
    !!v &&
    typeof v === 'object' &&
    'error' in v &&
    !!(v as ApiErrorBody).error &&
    typeof (v as ApiErrorBody).error.code === 'string'
  );
}

/** Maps an HTTP error response to an ApiError with a user-friendly message. */
export function classifyResponse(
  status: number,
  body: unknown,
  headers: { get(name: string): string | null },
): ApiError {
  const err = isErrorBody(body) ? body.error : undefined;
  const code = err?.code;
  const serverMessage = err?.message;
  const base = { status, code, details: err?.details, serverMessage };

  if (status === 429 || code === 'RATE_LIMITED') {
    const retryAfterMs = parseRetryAfter(headers.get('Retry-After'));
    const secs = retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 1000) : undefined;
    return new ApiError(
      'rate-limit',
      secs !== undefined
        ? `Too many requests, retrying in ${secs}s`
        : 'Too many requests, please wait a moment',
      { ...base, retryAfterMs },
    );
  }
  if (code === 'LIMIT_VIOLATION') {
    return new ApiError(
      'limit-violation',
      serverMessage ?? 'This copy would violate one of your safety limits',
      base,
    );
  }
  if (status === 401 || code === 'UNAUTHORIZED') {
    return new ApiError('auth', 'Your PolyMirror session expired. Reconnecting…', base);
  }
  if (status === 403 || code === 'FORBIDDEN') {
    return new ApiError('auth', serverMessage ?? 'You are not allowed to do this', base);
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return new ApiError('not-found', serverMessage ?? 'Not found', base);
  }
  if (status === 409 || code === 'CONFLICT') {
    return new ApiError(
      'conflict',
      serverMessage ?? 'The data changed in the meantime. Please review again.',
      base,
    );
  }
  if (code === 'UPSTREAM_TIMEOUT' || status === 504) {
    return new ApiError('timeout', 'Polymarket did not respond in time. Please retry.', base);
  }
  if (status === 400 || status === 422 || code === 'BAD_REQUEST') {
    return new ApiError('validation', serverMessage ?? 'Some values are invalid', base);
  }
  if (code === 'UPSTREAM_ERROR' || status === 502 || status === 503) {
    return new ApiError(
      'server',
      'The Polymarket data source is temporarily unavailable. Please retry.',
      base,
    );
  }
  return new ApiError('server', 'The PolyMirror server had a problem. Please retry.', base);
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue> | object;
  body?: unknown;
  /** Send the bearer token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiClientConfig {
  getBaseUrl: () => string | Promise<string>;
  getToken: () => Promise<string | null>;
  /**
   * Called once when an authenticated request returns 401. Should obtain a fresh token
   * (re-register) and return it, or null to give up.
   */
  onUnauthorized?: (failedToken: string | null) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ApiClient {
  request<T>(method: string, path: string, opts?: RequestOptions): Promise<T>;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, QueryValue>)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const defaultTimeout = config.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function once<T>(
    method: string,
    path: string,
    opts: RequestOptions,
    token: string | null,
  ): Promise<T> {
    const base = (await config.getBaseUrl()).replace(/\/+$/, '');
    const url = `${base}${path}${buildQuery(opts.query)}`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? defaultTimeout);
    const onOuterAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) {
        throw new ApiError('timeout', 'The request timed out. Check your connection and retry.');
      }
      if (opts.signal?.aborted) throw e; // caller cancelled (react-query): propagate as-is
      throw new ApiError('network', 'Cannot reach the PolyMirror server. Is it running?', {
        serverMessage: e instanceof Error ? e.message : undefined,
      });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }

    const text = await res.text().catch(() => '');
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    if (!res.ok) throw classifyResponse(res.status, parsed, res.headers);
    if (text && parsed === undefined) {
      throw new ApiError('server', 'The server sent an unreadable response.', {
        status: res.status,
      });
    }
    return parsed as T;
  }

  return {
    async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
      const useAuth = opts.auth !== false;
      const token = useAuth ? await config.getToken() : null;
      try {
        return await once<T>(method, path, opts, token);
      } catch (e) {
        if (useAuth && isApiError(e) && e.kind === 'auth' && e.status === 401 && config.onUnauthorized) {
          // Re-register once, then retry the original request a single time.
          const fresh = await config.onUnauthorized(token);
          if (fresh) return once<T>(method, path, opts, fresh);
        }
        throw e;
      }
    },
  };
}
