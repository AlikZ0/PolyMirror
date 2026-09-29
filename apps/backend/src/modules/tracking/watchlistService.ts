import type { WatchlistItem } from '@polymirror/shared';
import type { Db } from '../../database/prisma';
import { notFound } from '../../lib/errors';
import type { TradeService } from '../trades/service';

interface AnalyticsPayload {
  performance?: { totalPnl?: number | null; roi?: number | null };
  activity?: { totalVolume?: number | null; lastTradeAt?: number | null };
}

export class WatchlistService {
  constructor(
    private readonly db: Db,
    private readonly trades: TradeService,
    private readonly onMissingAnalytics: (address: string) => void,
  ) {}

  async list(userId: string): Promise<WatchlistItem[]> {
    const rows = await this.db.watchlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { trader: { include: { analytics: { where: { period: 'all' } } } } },
    });
    return rows.map((r) => {
      const payload = r.trader.analytics[0]?.payload as AnalyticsPayload | undefined;
      if (!payload) this.onMissingAnalytics(r.trader.address);
      return {
        id: r.id,
        traderAddress: r.trader.address,
        userName: r.trader.userName,
        status: r.status,
        lastTradeAt: r.trader.lastTradeAt?.getTime() ?? payload?.activity?.lastTradeAt ?? null,
        totalVolume: payload?.activity?.totalVolume ?? null,
        pnl: payload?.performance?.totalPnl ?? null,
        roi: payload?.performance?.roi ?? null,
        newTrades: r.newTrades,
        createdAt: r.createdAt.getTime(),
      };
    });
  }

  async add(userId: string, address: string): Promise<WatchlistItem> {
    const trader = await this.trades.ensureTrader(address);
    if (!trader.lastPolledAt) {
      // Start watching from "now": historical fills are never proposed as copies.
      await this.db.trader.update({ where: { id: trader.id }, data: { lastPolledAt: new Date() } });
    }
    await this.db.watchlist.upsert({
      where: { userId_traderId: { userId, traderId: trader.id } },
      create: { userId, traderId: trader.id },
      update: { status: 'ACTIVE', enabled: true },
    });
    await this.db.auditLog.create({ data: { userId, action: 'watchlist.add', entityType: 'Trader', entityId: trader.id } });
    const items = await this.list(userId);
    return items.find((i) => i.traderAddress === trader.address)!;
  }

  async setStatus(userId: string, id: string, status: 'ACTIVE' | 'PAUSED'): Promise<WatchlistItem> {
    const res = await this.db.watchlist.updateMany({ where: { id, userId }, data: { status, enabled: status === 'ACTIVE' } });
    if (res.count === 0) throw notFound('Watchlist entry not found');
    await this.db.auditLog.create({ data: { userId, action: `watchlist.${status.toLowerCase()}`, entityType: 'Watchlist', entityId: id } });
    return (await this.list(userId)).find((i) => i.id === id)!;
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.db.watchlist.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw notFound('Watchlist entry not found');
    await this.db.auditLog.create({ data: { userId, action: 'watchlist.remove', entityType: 'Watchlist', entityId: id } });
  }

  async markSeen(userId: string, address: string): Promise<void> {
    await this.db.watchlist.updateMany({ where: { userId, trader: { address: address.toLowerCase() } }, data: { newTrades: 0 } });
  }
}
