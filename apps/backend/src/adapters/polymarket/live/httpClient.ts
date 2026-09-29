import type { RateLimiter } from '../../../lib/async';
import { sleep } from '../../../lib/async';
import { UpstreamError, UpstreamTimeoutError } from '../../../lib/errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  limiter: RateLimiter;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: FetchLike;
  userAgent?: string;
}

export type QueryValue =
  string | number | boolean | undefined | null | readonly (string | number)[];

/**
 * JSON-over-HTTPS client for Polymarket's public read APIs.
 * - token bucket rate limiting shared per upstream
 * - per-request timeout
 * - bounded retries on 429 / 5xx honoring Retry-After (never retries 4xx)
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  }

  buildUrl(path: string, query: Record<string, QueryValue> = {}): string {
    const url = new URL(
      path.replace(/^\//, ''),
      this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async getJson<T = unknown>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const maxRetries = this.opts.maxRetries ?? 3;
    let attempt = 0;
    for (;;) {
      await this.opts.limiter.acquire();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'user-agent': this.opts.userAgent ?? 'PolyMirror/0.1',
          },
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if ((err as Error).name === 'AbortError') {
          if (attempt++ < maxRetries) continue;
          throw new UpstreamTimeoutError(`Polymarket request timed out: ${new URL(url).pathname}`);
        }
        if (attempt++ < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new UpstreamError(`Polymarket request failed: ${(err as Error).message}`);
      }
      clearTimeout(timer);

      if (res.ok) {
        return (await res.json()) as T;
      }
      if ((res.status === 429 || res.status >= 500) && attempt++ < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30_000)
            : backoff(attempt),
        );
        continue;
      }
      if (res.status === 404) return null as T;
      const body = await res.text().catch(() => '');
      throw new UpstreamError(
        `Polymarket responded ${res.status} for ${new URL(url).pathname}${body ? `: ${body.slice(0, 200)}` : ''}`,
        res.status,
      );
    }
  }
}

const backoff = (attempt: number) => Math.min(250 * 2 ** attempt, 5_000) + Math.random() * 100;
