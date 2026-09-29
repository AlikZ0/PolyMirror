import type { TradeFill } from '@polymirror/shared';
import type { Db } from '../../database/prisma';
import { isUniqueViolation } from '../../database/prisma';
import type { StoredTrade } from '../copy/types';
import type { MarketService } from '../markets/service';

/** Persists observed fills. The unique `sourceId` guarantees each fill is processed once. */
export class TradeService {
  constructor(
    private readonly db: Db,
    private readonly markets: MarketService,
  ) {}

  async ensureTrader(
    address: string,
    profile?: { userName: string | null; profileImage: string | null } | null,
  ) {
    const a = address.toLowerCase();
    return this.db.trader.upsert({
      where: { address: a },
      create: {
        address: a,
        userName: profile?.userName ?? null,
        profileImage: profile?.profileImage ?? null,
      },
      update: profile?.userName
        ? { userName: profile.userName, profileImage: profile.profileImage }
        : {},
    });
  }

  /** Inserts fills that were not seen before and returns only the new ones. */
  async ingest(traderId: string, fills: readonly TradeFill[]): Promise<StoredTrade[]> {
    if (fills.length === 0) return [];
    const known = new Set(
      (
        await this.db.trade.findMany({
          where: { sourceId: { in: fills.map((f) => f.id) } },
          select: { sourceId: true },
        })
      ).map((r) => r.sourceId),
    );
    const fresh = fills.filter((f) => !known.has(f.id));
    if (fresh.length === 0) return [];
    const markets = await this.markets.ensureMarkets(fresh.map((f) => f.conditionId));
    const marketRows = await this.db.market.findMany({
      where: { conditionId: { in: [...markets.keys()] } },
      select: { id: true, conditionId: true },
    });
    const marketIdByCondition = new Map(marketRows.map((m) => [m.conditionId, m.id]));

    const created: StoredTrade[] = [];
    for (const f of fresh) {
      const category = f.category ?? markets.get(f.conditionId)?.category ?? null;
      try {
        const row = await this.db.trade.create({
          data: {
            sourceId: f.id,
            traderId,
            marketId: marketIdByCondition.get(f.conditionId) ?? null,
            conditionId: f.conditionId,
            tokenId: f.tokenId,
            side: f.side,
            price: f.price,
            size: f.size,
            notional: f.notional,
            outcome: f.outcome,
            marketTitle: f.marketTitle ?? markets.get(f.conditionId)?.question ?? null,
            marketSlug: f.marketSlug,
            eventSlug: f.eventSlug,
            category,
            transactionHash: f.transactionHash,
            timestamp: new Date(f.timestamp),
          },
        });
        created.push({ ...f, category, marketTitle: row.marketTitle, dbId: row.id, traderId });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // Concurrent watcher inserted it first.
      }
    }
    return created;
  }
}
