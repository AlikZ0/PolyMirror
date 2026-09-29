/** Deterministic pseudo-random helpers for demo data. Not for security purposes. */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform [0,1) derived from a string key — stateless. */
export const unitHash = (key: string): number => mulberry32(hashString(key))();

export class Rng {
  private readonly next: () => number;
  constructor(seed: number | string) {
    this.next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  }
  float(): number {
    return this.next();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Log-normal sample with the given median and spread (sigma). */
  logNormal(median: number, sigma: number): number {
    const u1 = Math.max(this.next(), 1e-12);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return median * Math.exp(sigma * z);
  }
  hex(bytes: number): string {
    let s = '';
    for (let i = 0; i < bytes; i++) s += this.int(0, 255).toString(16).padStart(2, '0');
    return s;
  }
}
