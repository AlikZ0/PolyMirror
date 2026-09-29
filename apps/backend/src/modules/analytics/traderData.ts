import type { TradeFill, TraderPosition } from '@polymirror/shared';
import type { Prisma } from '@prisma/client';
import type { PolymarketAdapter, TraderStats } from '../../adapters/polymarket/types';
import type { Db } from '../../database/prisma';
import { TtlCache } from '../../lib/async';

export interface TraderData {
  address: string;
  fills: TradeFill[];
  positions: TraderPosition[];
  stats: TraderStats | null;
  profile: { userName: string | null; profileImage: string | null } | null;
  notes: string[];
  loadedAt: number;
}

export const MAX_FILLS_PER_TRADER = 2_000;

/** Loads (and briefly caches) everything we know about a trader from the data source. */
export class TraderDataLoader {
  private readonly cache: TtlCache<TraderData>;

  constructor(
    private readonly db: Db,
    private readonly adapter: PolymarketAdapter,
    ttlMs = 2 * 60_000,
  ) {
    this.cache = new TtlCache<TraderData>(ttlMs, 500);
  }

  invalidate(address: string) {
    this.cache.delete(address.toLowerCase());
  }

  load(address: string): Promise<TraderData> {
    const a = address.toLowerCase();
    return this.cache.getOrLoad(a, async () => {
      const fills = await this.adapter.getTraderFills(a, { maxFills: MAX_FILLS_PER_TRADER });
      const [positions, stats, profile] = await Promise.all([
        this.adapter.getTraderPositions(a, fills),
        this.adapter.getTraderStats(a).catch(() => null),
        this.adapter.getTraderProfile(a).catch(() => null),
      ]);
      const notes: string[] = [];
      if (fills.length >= MAX_FILLS_PER_TRADER) {
        notes.push(`Activity metrics use the ${MAX_FILLS_PER_TRADER.toLocaleString('en-US')} most recent fills.`);
      }
      const data: TraderData = { address: a, fills, positions, stats, profile, notes, loadedAt: Date.now() };
      void this.persistPositions(data).catch(() => undefined);
      return data;
    });
  }

  /** Caches reconstructed positions in TraderTrade (used for history queries and audits). */
  private async persistPositions(data: TraderData) {
    if (data.positions.length === 0) return;
    const trader = await this.db.trader.upsert({
      where: { address: data.address },
      create: { address: data.address, userName: data.profile?.userName ?? null, profileImage: data.profile?.profileImage ?? null },
      update: {
        lastTradeAt: data.fills[0] ? new Date(data.fills[0].timestamp) : undefined,
        ...(data.profile?.userName ? { userName: data.profile.userName } : {}),
      },
    });
    const date = (v: number | null) => (v === null ? null : new Date(v));
    await this.db.$transaction(
      data.positions.slice(0, 1_000).map((p) => {
        const row = {
          conditionId: p.conditionId,
          tokenId: p.tokenId,
          marketTitle: p.marketTitle,
          marketSlug: p.marketSlug,
          outcome: p.outcome,
          category: p.category,
          status: p.status,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice,
          cost: p.cost,
          pnl: p.pnl,
          realizedPnl: p.realizedPnl,
          roi: p.roi,
          openedAt: date(p.openedAt),
          closedAt: date(p.closedAt),
        };
        return this.db.traderTrade.upsert({
          where: { traderId_positionKey: { traderId: trader.id, positionKey: p.id } },
          create: { traderId: trader.id, positionKey: p.id, ...row },
          update: row,
        });
      }),
    );
  }

  async saveAnalyticsSnapshot(address: string, period: string, payload: unknown) {
    const trader = await this.db.trader.findUnique({ where: { address: address.toLowerCase() }, select: { id: true } });
    if (!trader) return;
    const json = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
    await this.db.analyticsSnapshot.upsert({
      where: { traderId_period: { traderId: trader.id, period } },
      create: { traderId: trader.id, period, payload: json },
      update: { payload: json, computedAt: new Date() },
    });
  }
}
