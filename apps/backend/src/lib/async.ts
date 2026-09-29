export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn` over items with at most `concurrency` in flight. Preserves order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Token bucket limiting outbound requests per second. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst = Math.max(1, Math.ceil(ratePerSecond)),
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  acquire(): Promise<void> {
    const run = async () => {
      for (;;) {
        const t = this.now();
        this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.ratePerSecond);
        this.last = t;
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        await sleep(Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000));
      }
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

/** Minimal TTL cache with in-flight de-duplication. */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expires: number }>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1_000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = loader()
      .then((v) => {
        this.set(key, v);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
