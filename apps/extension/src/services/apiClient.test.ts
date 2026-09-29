import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, parseRetryAfter } from './apiClient';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function client(
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof createApiClient>[0]> = {},
) {
  return createApiClient({
    getBaseUrl: () => 'http://api.test',
    getToken: async () => 'tok',
    fetchImpl,
    ...extra,
  });
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('apiClient', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const res = await client(fetchImpl as unknown as typeof fetch).request('GET', '/api/x', {
      query: { a: 1, b: undefined, c: '' },
    });
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/x?a=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('classifies 401 as auth and re-registers once before retrying', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'bad token' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const onUnauthorized = vi.fn(async () => 'fresh');
    const res = await client(fetchImpl, { onUnauthorized }).request('GET', '/api/x');
    expect(res).toEqual({ ok: 1 });
    expect(onUnauthorized).toHaveBeenCalledWith('tok');
    const init = fetchImpl.mock.calls[1]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('gives up with an auth error when the retry is also unauthorized', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }),
    );
    const onUnauthorized = vi.fn(async () => 'fresh');
    const err = await failure(
      client(fetchImpl as unknown as typeof fetch, { onUnauthorized }).request('GET', '/x'),
    );
    expect(err.kind).toBe('auth');
    expect(err.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('classifies 429 as rate-limit and parses Retry-After', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        429,
        { error: { code: 'RATE_LIMITED', message: 'slow down' } },
        { 'Retry-After': '7' },
      ),
    );
    const err = await failure(client(fetchImpl as unknown as typeof fetch).request('GET', '/x'));
    expect(err.kind).toBe('rate-limit');
    expect(err.retryAfterMs).toBe(7_000);
    expect(err.message).toBe('Too many requests, retrying in 7s');
  });

  it('parses HTTP-date Retry-After values', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('garbage')).toBeUndefined();
  });

  it('classifies 422 LIMIT_VIOLATION and exposes the failed checks', async () => {
    const details = [
      {
        code: 'MAX_DAILY_COPY_VOLUME',
        passed: false,
        state: 'fail',
        message: 'Daily limit reached',
      },
    ];
    const fetchImpl = vi.fn(async () =>
      jsonResponse(422, { error: { code: 'LIMIT_VIOLATION', message: 'Limit violated', details } }),
    );
    const err = await failure(
      client(fetchImpl as unknown as typeof fetch).request('POST', '/api/copy/confirm', {
        body: {},
      }),
    );
    expect(err.kind).toBe('limit-violation');
    expect(err.failedChecks).toEqual(details);
    expect(err.message).toBe('Limit violated');
  });

  it('classifies 422/400 without LIMIT_VIOLATION as validation', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, {
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid',
          details: [{ path: ['maxPerTrade'], message: 'Too big' }],
        },
      }),
    );
    const err = await failure(
      client(fetchImpl as unknown as typeof fetch).request('PUT', '/x', { body: {} }),
    );
    expect(err.kind).toBe('validation');
    expect(err.fieldErrors).toEqual({ maxPerTrade: 'Too big' });
  });

  it('classifies 500 as server error with a friendly message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(500, { error: { code: 'INTERNAL', message: 'stack trace…' } }),
    );
    const err = await failure(client(fetchImpl as unknown as typeof fetch).request('GET', '/x'));
    expect(err.kind).toBe('server');
    expect(err.status).toBe(500);
    expect(err.message).not.toContain('stack trace');
  });

  it('classifies 404 as not-found', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No trader' } }),
    );
    const err = await failure(client(fetchImpl as unknown as typeof fetch).request('GET', '/x'));
    expect(err.kind).toBe('not-found');
  });

  it('classifies a hung request as timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );
      const p = failure(
        client(fetchImpl as unknown as typeof fetch, { timeoutMs: 15_000 }).request('GET', '/x'),
      );
      await vi.advanceTimersByTimeAsync(15_000);
      const err = await p;
      expect(err.kind).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies a failed fetch as network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await failure(client(fetchImpl as unknown as typeof fetch).request('GET', '/x'));
    expect(err.kind).toBe('network');
  });

  it('does not send a token for unauthenticated routes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    await client(fetchImpl as unknown as typeof fetch).request('GET', '/api/system', {
      auth: false,
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
