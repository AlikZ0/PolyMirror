import type { LeaderboardEntry, MarketInfo, TradeFill, TraderPosition } from '@polymirror/shared';
import { RateLimiter, TtlCache } from '../../../lib/async';
import type { FillQuery, PolymarketAdapter, TraderStats } from '../types';
import { type FetchLike, HttpClient } from './httpClient';
import {
  parseLeaderboard,
  parseMarkets,
  parseMidpoint,
  parsePositions,
  parseTrades,
  parseUserStats,
  unwrapPage,
} from './parsers';

export interface LiveAdapterOptions {
  dataUrl: string;
  gammaUrl: string;
  clobUrl: string;
  webUrl: string;
  maxRps: number;
  fetchImpl?: FetchLike;
  /** Hard cap on pages fetched per list call (protects the rate budget). */
  maxPages?: number;
}

const PAGE_SIZE = 500;

/**
 * Read-only adapter over Polymarket's public APIs:
 * - Data API v2 (`/v2/trades`, `/v2/positions`, `/v2/leaderboard`, `/v2/user-stats`)
 * - Gamma (`/markets/keyset`) for market metadata and categories
 * - CLOB public market data (`/midpoint`) for reference prices
 * No authentication is used or required. All requests share one rate budget.
 */
export class LivePolymarketAdapter implements PolymarketAdapter {
  readonly mode = 'live' as const;
  readonly sourceName = 'Polymarket Data API v2';

  private readonly data: HttpClient;
  private readonly gamma: HttpClient;
  private readonly clob: HttpClient;
  private readonly maxPages: number;
  private readonly marketCache = new TtlCache<MarketInfo | null>(10 * 60_000, 5_000);
  private readonly priceCache = new TtlCache<number | null>(5_000, 5_000);
  private readonly profileCache = new TtlCache<{
    userName: string | null;
    profileImage: string | null;
  }>(60 * 60_000, 5_000);

  constructor(private readonly opts: LiveAdapterOptions) {
    const limiter = new RateLimiter(opts.maxRps);
    this.data = new HttpClient({ baseUrl: opts.dataUrl, limiter, fetchImpl: opts.fetchImpl });
    this.gamma = new HttpClient({ baseUrl: opts.gammaUrl, limiter, fetchImpl: opts.fetchImpl });
    this.clob = new HttpClient({
      baseUrl: opts.clobUrl,
      limiter,
      fetchImpl: opts.fetchImpl,
      timeoutMs: 5_000,
    });
    this.maxPages = opts.maxPages ?? 10;
  }

  async listLeaderboard(params: {
    window: 'day' | 'week' | 'month' | 'all';
    sortBy: 'VOLUME' | 'PNL';
    limit: number;
    category?: string;
  }): Promise<LeaderboardEntry[]> {
    const out: LeaderboardEntry[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < this.maxPages && out.length < params.limit; page++) {
      const json = await this.data.getJson('/v2/leaderboard', {
        timePeriod: params.window,
        sortBy: params.sortBy,
        category: params.category,
        limit: Math.min(100, params.limit - out.length),
        cursor: cursor ?? undefined,
      });
      const { items, nextCursor } = unwrapPage(json);
      const rows = parseLeaderboard(items);
      for (const r of rows)
        this.profileCache.set(r.address, { userName: r.userName, profileImage: r.profileImage });
      out.push(...rows);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return out.slice(0, params.limit);
  }

  async getTraderFills(address: string, query: FillQuery = {}): Promise<TradeFill[]> {
    const max = query.maxFills ?? PAGE_SIZE * 4;
    const fills: TradeFill[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < this.maxPages && fills.length < max; page++) {
      const json = await this.data.getJson('/v2/trades', {
        user: address,
        takerOnly: false,
        limit: Math.min(PAGE_SIZE, max - fills.length),
        cursor: cursor ?? undefined,
        start: query.since !== undefined ? Math.floor(query.since / 1000) : undefined,
        conditionId: query.conditionId,
        side: query.side,
      });
      const { items, nextCursor } = unwrapPage(json);
      const parsed = parseTrades(items);
      for (const [addr, profile] of parsed.profiles) this.profileCache.set(addr, profile);
      fills.push(...parsed.fills);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    await this.attachCategories(fills);
    return fills.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getTraderPositions(
    address: string,
    fillsHint: readonly TradeFill[] = [],
  ): Promise<TraderPosition[]> {
    const firstBuyAt = new Map<string, number>();
    for (const f of fillsHint) {
      if (f.side !== 'BUY') continue;
      const prev = firstBuyAt.get(f.tokenId);
      if (prev === undefined || f.timestamp < prev) firstBuyAt.set(f.tokenId, f.timestamp);
    }
    const categoryByCondition = new Map(fillsHint.map((f) => [f.conditionId, f.category]));

    const positions: TraderPosition[] = [];
    for (const status of ['OPEN', 'REDEEMABLE', 'CLOSED'] as const) {
      let cursor: string | null = null;
      for (let page = 0; page < this.maxPages; page++) {
        const json = await this.data.getJson('/v2/positions', {
          user: address,
          status,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        const { items, nextCursor } = unwrapPage(json);
        positions.push(...parsePositions(items, firstBuyAt));
        if (!nextCursor) break;
        cursor = nextCursor;
      }
    }
    for (const p of positions) p.category = categoryByCondition.get(p.conditionId) ?? null;
    const missing = positions.filter((p) => p.category === null).map((p) => p.conditionId);
    if (missing.length) {
      const markets = await this.getMarkets(missing);
      const byId = new Map(markets.map((m) => [m.conditionId, m.category]));
      for (const p of positions)
        if (p.category === null) p.category = byId.get(p.conditionId) ?? null;
    }
    return positions;
  }

  async getTraderStats(address: string): Promise<TraderStats | null> {
    return parseUserStats(await this.data.getJson('/v2/user-stats', { user: address }));
  }

  async getTraderProfile(address: string) {
    return this.profileCache.get(address.toLowerCase()) ?? null;
  }

  async getMarkets(conditionIds: readonly string[]): Promise<MarketInfo[]> {
    const unique = [...new Set(conditionIds)];
    const result: MarketInfo[] = [];
    const toFetch: string[] = [];
    for (const id of unique) {
      const hit = this.marketCache.get(id);
      if (hit === undefined) toFetch.push(id);
      else if (hit) result.push(hit);
    }
    for (let i = 0; i < toFetch.length; i += 20) {
      const chunk = toFetch.slice(i, i + 20);
      const json = await this.gamma.getJson('/markets/keyset', {
        condition_ids: chunk,
        include_tag: true,
        limit: chunk.length,
      });
      const markets = parseMarkets(json, this.opts.webUrl);
      const found = new Set<string>();
      for (const m of markets) {
        this.marketCache.set(m.conditionId, m);
        found.add(m.conditionId);
        result.push(m);
      }
      // Remember misses briefly so unknown ids don't burn the rate budget.
      for (const id of chunk) if (!found.has(id)) this.marketCache.set(id, null);
    }
    return result;
  }

  async getCurrentPrice(tokenId: string): Promise<number | null> {
    return this.priceCache.getOrLoad(tokenId, async () =>
      parseMidpoint(await this.clob.getJson('/midpoint', { token_id: tokenId })),
    );
  }

  marketUrl(input: { eventSlug: string | null; marketSlug: string | null }): string | null {
    if (input.eventSlug) return `${this.opts.webUrl}/event/${input.eventSlug}`;
    if (input.marketSlug) return `${this.opts.webUrl}/market/${input.marketSlug}`;
    return null;
  }

  private async attachCategories(fills: TradeFill[]): Promise<void> {
    if (fills.length === 0) return;
    try {
      const markets = await this.getMarkets(fills.map((f) => f.conditionId));
      const byId = new Map(markets.map((m) => [m.conditionId, m.category]));
      for (const f of fills) f.category = byId.get(f.conditionId) ?? null;
    } catch {
      // Category is optional metadata; fills stay uncategorized if Gamma is unavailable.
    }
  }
}
