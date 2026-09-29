import {
  COMPARISON_DISCLAIMER,
  INACTIVE_AFTER_MS,
  computeTraderAnalytics,
  summarizeTrader,
} from '@polymirror/shared';
import type {
  HistoricalTradeRow,
  HistoricalTradesQuery,
  Paginated,
  PerformanceComparison,
  ScannerFilters,
  TimePeriod,
  TraderAnalytics,
  TraderProfile,
  TraderSummary,
} from '@polymirror/shared';
import { periodToWindow } from '../../adapters/polymarket/types';
import type { PolymarketAdapter } from '../../adapters/polymarket/types';
import type { Db } from '../../database/prisma';
import { TtlCache, mapLimit } from '../../lib/async';
import type { TraderDataLoader } from '../analytics/traderData';
import type { StatisticsService } from '../analytics/statistics';

export class TraderService {
  private readonly summaryCache = new TtlCache<TraderSummary>(10 * 60_000, 2_000);

  constructor(
    private readonly db: Db,
    private readonly adapter: PolymarketAdapter,
    private readonly loader: TraderDataLoader,
    private readonly stats: StatisticsService,
    private readonly options: { enrichLimit: number },
  ) {}

  private async watchedMap(userId: string): Promise<Map<string, string>> {
    const rows = await this.db.watchlist.findMany({
      where: { userId },
      include: { trader: { select: { address: true } } },
    });
    return new Map(rows.map((r) => [r.trader.address, r.id]));
  }

  async analytics(address: string, period: TimePeriod): Promise<TraderAnalytics> {
    const data = await this.loader.load(address);
    const analytics = computeTraderAnalytics({
      address,
      period,
      fills: data.fills,
      positions: data.positions,
      notes: data.notes,
    });
    void this.loader.saveAnalyticsSnapshot(address, period, analytics).catch(() => undefined);
    return analytics;
  }

  async profile(userId: string, address: string): Promise<TraderProfile> {
    const [data, analytics, watched] = await Promise.all([
      this.loader.load(address),
      this.analytics(address, 'all'),
      this.watchedMap(userId),
    ]);
    const a = address.toLowerCase();
    const empty = data.fills.length === 0 && data.positions.length === 0;
    return {
      address: a,
      userName: data.profile?.userName ?? null,
      profileImage: data.profile?.profileImage ?? null,
      totalVolume: empty ? null : analytics.activity.totalVolume,
      tradeCount: empty ? null : analytics.activity.totalTrades,
      averagePosition: analytics.risk.averagePositionSize,
      largestPosition: analytics.risk.largestPosition,
      pnl: analytics.performance.totalPnl,
      roi: analytics.performance.roi,
      winRate: analytics.performance.winRate,
      averageHoldingTimeMs: analytics.activity.averageHoldingTimeMs,
      maxDrawdown: analytics.risk.maxDrawdown,
      lastActive: analytics.activity.lastTradeAt,
      categories: analytics.charts.categories
        .map((c) => c.label)
        .filter((l) => l !== 'Uncategorized'),
      marketsTraded:
        data.stats?.marketsTraded ??
        (empty ? null : new Set(data.fills.map((f) => f.conditionId)).size),
      joinDate: data.stats?.joinDate ?? null,
      isWatched: watched.has(a),
      watchlistId: watched.get(a) ?? null,
    };
  }

  async trades(
    address: string,
    q: Required<
      Pick<HistoricalTradesQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDirection' | 'status'>
    > &
      HistoricalTradesQuery,
  ): Promise<Paginated<HistoricalTradeRow>> {
    const data = await this.loader.load(address);
    let rows: HistoricalTradeRow[] = data.positions.map((p) => ({
      id: p.id,
      date: p.closedAt ?? p.openedAt,
      market: p.marketTitle,
      marketSlug: p.marketSlug,
      side: 'BUY',
      outcome: p.outcome,
      entry: p.entryPrice,
      exit: p.exitPrice,
      positionSize: p.cost,
      pnl: p.pnl,
      roi: p.roi,
      status: p.status,
      category: p.category,
    }));
    if (q.status !== 'ALL') rows = rows.filter((r) => r.status === q.status);
    if (q.search) {
      const s = q.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.market ?? '').toLowerCase().includes(s) || (r.outcome ?? '').toLowerCase().includes(s),
      );
    }
    if (q.from !== undefined) rows = rows.filter((r) => r.date !== null && r.date >= q.from!);
    if (q.to !== undefined) rows = rows.filter((r) => r.date !== null && r.date <= q.to!);
    const dir = q.sortDirection === 'asc' ? 1 : -1;
    const key = (r: HistoricalTradeRow): number | string => {
      switch (q.sortBy) {
        case 'positionSize':
          return r.positionSize;
        case 'pnl':
          return r.pnl ?? Number.NEGATIVE_INFINITY;
        case 'roi':
          return r.roi ?? Number.NEGATIVE_INFINITY;
        case 'market':
          return (r.market ?? '').toLowerCase();
        default:
          return r.date ?? 0;
      }
    };
    rows.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
    const start = (q.page - 1) * q.pageSize;
    return {
      items: rows.slice(start, start + q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Whale Scanner: leaderboard candidates (real volume / P&L), enriched with per-trader
   * metrics for the top candidates. A row that cannot be verified against an active filter
   * (metric N/A) is excluded rather than guessed.
   */
  async scan(userId: string, f: ScannerFilters & { limit: number }) {
    const now = Date.now();
    const candidates = await this.adapter.listLeaderboard({
      window: periodToWindow(f.period),
      sortBy: f.sortBy === 'pnl' || f.sortBy === 'roi' ? 'PNL' : 'VOLUME',
      limit: Math.min(200, Math.max(f.limit * 2, 50)),
    });
    const watched = await this.watchedMap(userId);
    const enrichCount =
      this.adapter.mode === 'demo'
        ? candidates.length
        : Math.min(this.options.enrichLimit, candidates.length);

    const rows = await mapLimit(candidates, 3, async (c, i): Promise<TraderSummary> => {
      const base: TraderSummary = {
        address: c.address,
        userName: c.userName,
        profileImage: c.profileImage,
        totalVolume: c.volume,
        tradeCount: null,
        averagePosition: null,
        largestTrade: null,
        pnl: c.pnl,
        roi: null,
        winRate: null,
        maxDrawdown: null,
        lastActive: null,
        categories: [],
        active: null,
        enriched: false,
        isWatched: watched.has(c.address),
      };
      if (i >= enrichCount) return base;
      try {
        const key = `${c.address}|${f.period}`;
        const summary = await this.summaryCache.getOrLoad(key, async () => {
          const analytics = await this.analytics(c.address, f.period);
          return summarizeTrader(
            { address: c.address, userName: c.userName, profileImage: c.profileImage },
            analytics,
            now,
            false,
          );
        });
        return { ...summary, isWatched: watched.has(c.address) };
      } catch {
        return base;
      }
    });

    const pass = (v: number | null, min: number | undefined) =>
      min === undefined || (v !== null && v >= min);
    const filtered = rows.filter((r) => {
      if (!pass(r.totalVolume, f.minTotalVolume)) return false;
      if (!pass(r.tradeCount, f.minTrades)) return false;
      if (!pass(r.largestTrade, f.minTradeSize)) return false;
      if (!pass(r.pnl, f.minPnl)) return false;
      if (!pass(r.roi, f.minRoi === undefined ? undefined : f.minRoi / 100)) return false;
      if (!pass(r.winRate, f.minWinRate === undefined ? undefined : f.minWinRate / 100))
        return false;
      if (!pass(r.averagePosition, f.minAveragePosition)) return false;
      if (f.maxDrawdown !== undefined && (r.maxDrawdown === null || r.maxDrawdown > f.maxDrawdown))
        return false;
      if (f.category && !r.categories.some((c) => c.toLowerCase() === f.category!.toLowerCase()))
        return false;
      if (f.activity === 'active' && r.active !== true) return false;
      if (f.activity === 'inactive' && r.active !== false) return false;
      return true;
    });

    const dir = f.sortDirection === 'asc' ? 1 : -1;
    const sortKey = f.sortBy ?? 'totalVolume';
    filtered.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // N/A always last
      if (vb === null) return -1;
      return ((va as number) - (vb as number)) * dir;
    });

    void this.persistSnapshots(
      filtered.filter((r) => r.enriched),
      f.period,
    ).catch(() => undefined);
    return { items: filtered.slice(0, f.limit), generatedAt: now, source: this.adapter.sourceName };
  }

  private async persistSnapshots(rows: TraderSummary[], period: TimePeriod) {
    for (const r of rows.slice(0, 50)) {
      const trader = await this.db.trader.upsert({
        where: { address: r.address },
        create: { address: r.address, userName: r.userName, profileImage: r.profileImage },
        update: {},
      });
      await this.db.traderSnapshot.create({
        data: {
          traderId: trader.id,
          period,
          totalVolume: r.totalVolume,
          tradeCount: r.tradeCount,
          averagePosition: r.averagePosition,
          largestTrade: r.largestTrade,
          pnl: r.pnl,
          roi: r.roi,
          winRate: r.winRate,
          maxDrawdown: r.maxDrawdown,
          lastActive: r.lastActive ? new Date(r.lastActive) : null,
          categories: r.categories,
          source: this.adapter.sourceName,
        },
      });
    }
  }

  async performance(userId: string, address: string): Promise<PerformanceComparison> {
    const [analytics, user] = await Promise.all([
      this.analytics(address, 'all'),
      this.stats.forUser(userId, address),
    ]);
    return {
      traderAddress: address.toLowerCase(),
      trader: {
        roi: analytics.performance.roi,
        pnl: analytics.performance.totalPnl,
        winRate: analytics.performance.winRate,
        maxDrawdown: analytics.risk.maxDrawdown,
      },
      user: {
        roi: user.roi,
        pnl: user.totalPnl,
        winRate: user.winRate,
        maxDrawdown: user.maxDrawdown,
      },
      copiedTrades: user.totalCopied,
      disclaimer: COMPARISON_DISCLAIMER,
    };
  }

  isInactive(lastTradeAt: number | null, now = Date.now()) {
    return lastTradeAt !== null && now - lastTradeAt > INACTIVE_AFTER_MS;
  }
}
