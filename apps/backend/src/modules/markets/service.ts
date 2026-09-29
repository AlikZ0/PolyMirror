import type { MarketInfo } from '@polymirror/shared';
import type { PolymarketAdapter } from '../../adapters/polymarket/types';
import type { Db } from '../../database/prisma';
import { TtlCache } from '../../lib/async';
import type { MarketPort } from '../copy/types';

/** Market metadata (cached in memory and persisted to the Market table) + price access. */
export class MarketService implements MarketPort {
  private readonly cache = new TtlCache<MarketInfo | null>(5 * 60_000, 5_000);

  constructor(
    private readonly db: Db,
    private readonly adapter: PolymarketAdapter,
  ) {}

  async getMarket(conditionId: string): Promise<MarketInfo | null> {
    return this.cache.getOrLoad(conditionId, async () => {
      const [m] = await this.adapter.getMarkets([conditionId]);
      if (!m) return null;
      await this.persist(m).catch(() => undefined);
      return m;
    });
  }

  async ensureMarkets(conditionIds: readonly string[]): Promise<Map<string, MarketInfo>> {
    const out = new Map<string, MarketInfo>();
    const missing: string[] = [];
    for (const id of new Set(conditionIds)) {
      const hit = this.cache.get(id);
      if (hit) out.set(id, hit);
      else if (hit === undefined) missing.push(id);
    }
    if (missing.length) {
      const fetched = await this.adapter.getMarkets(missing).catch(() => []);
      for (const m of fetched) {
        this.cache.set(m.conditionId, m);
        out.set(m.conditionId, m);
        await this.persist(m).catch(() => undefined);
      }
    }
    return out;
  }

  async getMarketState(conditionId: string) {
    const m = await this.getMarket(conditionId).catch(() => null);
    if (!m) return { active: null, url: null, category: null };
    const resolvedPrice = (tokenId: string): number | null => {
      if (!m.closed) return null;
      const idx = m.tokenIds.indexOf(tokenId);
      const p = idx >= 0 ? m.outcomePrices[idx] : undefined;
      return p !== undefined && Number.isFinite(p) ? p : null;
    };
    return {
      active: m.active && !m.closed,
      url: m.url ?? this.adapter.marketUrl({ eventSlug: m.eventSlug, marketSlug: m.slug }),
      category: m.category,
      resolvedPrice,
    };
  }

  getCurrentPrice(tokenId: string): Promise<number | null> {
    return this.adapter.getCurrentPrice(tokenId);
  }

  private async persist(m: MarketInfo) {
    const data = {
      question: m.question,
      slug: m.slug,
      eventSlug: m.eventSlug,
      category: m.category,
      active: m.active,
      closed: m.closed,
      outcomes: m.outcomes,
      tokenIds: m.tokenIds,
      outcomePrices: m.outcomePrices.filter((p) => Number.isFinite(p)),
    };
    await this.db.market.upsert({
      where: { conditionId: m.conditionId },
      create: { conditionId: m.conditionId, ...data },
      update: data,
    });
  }
}
