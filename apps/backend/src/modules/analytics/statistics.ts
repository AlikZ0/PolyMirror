import {
  calculateMaxDrawdown,
  calculateRoi,
  calculateWinRate,
  dayStartUtc,
  maxOf,
  mean,
  minOf,
  sum,
} from '@polymirror/shared';
import type { DashboardSummary, UserStatistics } from '@polymirror/shared';
import type { DataMode } from '@polymirror/shared';
import type { Db } from '../../database/prisma';
import { dec, decReq } from '../../database/mappers';
import type { NotificationService } from '../notifications/service';

/** The user's own copy-trading statistics, computed only from their verified copy orders. */
export class StatisticsService {
  constructor(private readonly db: Db) {}

  async forUser(userId: string, traderAddress?: string): Promise<UserStatistics> {
    const traderFilter = traderAddress ? { trader: { address: traderAddress.toLowerCase() } } : {};
    const [grouped, confirmed] = await Promise.all([
      this.db.copyOrder.groupBy({
        by: ['status'],
        where: { userId, ...traderFilter },
        _count: { _all: true },
      }),
      this.db.copyOrder.findMany({
        where: { userId, status: 'CONFIRMED', ...traderFilter },
        select: { amount: true, pnl: true, executedAt: true, closedAt: true },
        orderBy: { executedAt: 'asc' },
      }),
    ]);
    const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    const amounts = confirmed.map((c) => decReq(c.amount));
    const pnls = confirmed.map((c) => dec(c.pnl)).filter((p): p is number => p !== null);
    const closedPnls = confirmed
      .filter((c) => c.closedAt !== null)
      .map((c) => dec(c.pnl))
      .filter((p): p is number => p !== null);
    const totalVolume = sum(amounts);
    const totalPnl = pnls.length ? sum(pnls) : null;
    const today = dayStartUtc(Date.now());

    const byDay = new Map<number, number>();
    for (const c of confirmed) {
      const p = dec(c.pnl);
      if (p === null || !c.executedAt) continue;
      const d = dayStartUtc(c.executedAt.getTime());
      byDay.set(d, (byDay.get(d) ?? 0) + p);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
    const dd = calculateMaxDrawdown(days.map(([, v]) => v));

    return {
      totalCopied: count('CONFIRMED'),
      totalSkipped: count('SKIPPED'),
      totalFailed: count('FAILED'),
      totalPending: count('PENDING') + count('EXECUTING') + count('SUBMITTED'),
      totalVolume,
      totalPnl,
      roi: totalPnl === null ? null : calculateRoi(totalPnl, totalVolume),
      winRate: calculateWinRate(closedPnls),
      averageTrade: mean(amounts),
      bestTrade: maxOf(pnls),
      worstTrade: minOf(pnls),
      maxDrawdown: days.length ? dd.maxDrawdown : null,
      todayVolume: sum(
        confirmed
          .filter((c) => c.executedAt && c.executedAt.getTime() >= today)
          .map((c) => decReq(c.amount)),
      ),
      cumulativePnl: days.map(([t], i) => ({ t, value: dd.equity[i]! })),
    };
  }

  async dashboard(
    userId: string,
    mode: DataMode,
    notifications: NotificationService,
  ): Promise<DashboardSummary> {
    const [tracked, newTrades, stats, pending, events] = await Promise.all([
      this.db.watchlist.count({ where: { userId, status: 'ACTIVE' } }),
      this.db.watchlist.aggregate({ where: { userId }, _sum: { newTrades: true } }),
      this.forUser(userId),
      this.db.copyOrder.count({
        where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      }),
      notifications.list(userId, 15),
    ]);
    return {
      mode,
      trackedTraders: tracked,
      newTrades: newTrades._sum.newTrades ?? 0,
      copiedTrades: stats.totalCopied,
      skippedTrades: stats.totalSkipped,
      todayCopiedVolume: stats.todayVolume,
      pnl: stats.totalPnl,
      pendingConfirmations: pending,
      recentEvents: events.items,
    };
  }
}
