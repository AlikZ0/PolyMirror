import { DAY_MS, INACTIVE_AFTER_MS } from '@polymirror/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { PolymarketAdapter } from '../../adapters/polymarket/types';
import type { Db } from '../../database/prisma';
import { mapLimit } from '../../lib/async';
import type { CopyEngine } from '../copy/engine';
import type { CopyEventsPort } from '../copy/types';
import type { TradeService } from '../trades/service';

/** Re-query this far back on every poll: late-indexed fills are still caught (dedupe by sourceId). */
const OVERLAP_MS = 2 * 60_000;

/**
 * Polls followed traders for new fills (the public Data API offers no per-user push feed),
 * persists new fills exactly once, and hands fresh ones to the copy engine.
 */
export class TradeWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly inactiveNotified = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly adapter: PolymarketAdapter,
    private readonly trades: TradeService,
    private readonly engine: CopyEngine,
    private readonly events: CopyEventsPort,
    private readonly log: FastifyBaseLogger,
    private readonly options: { intervalMs: number; maxTradeAgeMs: number },
    private readonly onNewTrades: (address: string) => void = () => undefined,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = Date.now()): Promise<number> {
    if (this.running) return 0; // Never overlap polls.
    this.running = true;
    try {
      const traders = await this.db.trader.findMany({
        where: { watchlist: { some: { status: 'ACTIVE' } } },
        select: { id: true, address: true, lastPolledAt: true, lastTradeAt: true },
      });
      const counts = await mapLimit(traders, 3, (t) =>
        this.pollTrader(t, now).catch((err: Error) => {
          this.log.warn({ err: err.message, trader: t.address }, 'watcher poll failed');
          return 0;
        }),
      );
      return counts.reduce((a, b) => a + b, 0);
    } finally {
      this.running = false;
    }
  }

  private async pollTrader(
    t: { id: string; address: string; lastPolledAt: Date | null; lastTradeAt: Date | null },
    now: number,
  ) {
    const since = (t.lastPolledAt?.getTime() ?? now - this.options.intervalMs) - OVERLAP_MS;
    const fills = await this.adapter.getTraderFills(t.address, { since, maxFills: 200 });
    const fresh = await this.trades.ingest(
      t.id,
      [...fills].sort((a, b) => a.timestamp - b.timestamp),
    );
    const newest = fills.reduce<number | null>(
      (m, f) => (m === null || f.timestamp > m ? f.timestamp : m),
      null,
    );
    await this.db.trader.update({
      where: { id: t.id },
      data: {
        lastPolledAt: new Date(now),
        ...(newest !== null && (!t.lastTradeAt || newest > t.lastTradeAt.getTime())
          ? { lastTradeAt: new Date(newest) }
          : {}),
      },
    });

    const watchers = await this.db.watchlist.findMany({
      where: { traderId: t.id, status: 'ACTIVE' },
      select: { userId: true, createdAt: true },
    });
    const userIds = watchers.map((w) => w.userId);

    if (fresh.length > 0) {
      this.onNewTrades(t.address);
      await this.db.watchlist.updateMany({
        where: { traderId: t.id, status: 'ACTIVE' },
        data: { newTrades: { increment: fresh.length } },
      });
      for (const trade of fresh) {
        for (const userId of userIds) {
          this.events.emit(userId, 'trader.trade', {
            trade,
            traderAddress: t.address,
            detectedAt: now,
          });
        }
        // Only fresh trades become copy proposals; late-discovered ones are informational.
        // Trades that happened before a user followed the trader are never proposed to them.
        if (now - trade.timestamp <= this.options.maxTradeAgeMs) {
          const eligible = watchers
            .filter((w) => trade.timestamp >= w.createdAt.getTime())
            .map((w) => w.userId);
          if (eligible.length) await this.engine.onWhaleTrade(trade, eligible);
        }
      }
    }

    const lastTradeAt = newest ?? t.lastTradeAt?.getTime() ?? null;
    if (lastTradeAt !== null && now - lastTradeAt > INACTIVE_AFTER_MS) {
      for (const userId of userIds) {
        const key = `${userId}|${t.address}`;
        if (now - (this.inactiveNotified.get(key) ?? 0) < DAY_MS) continue;
        this.inactiveNotified.set(key, now);
        this.events.emit(userId, 'trader.status', {
          traderAddress: t.address,
          status: 'INACTIVE',
          lastTradeAt,
        });
        await this.events.notify(userId, {
          type: 'TRADER_INACTIVE',
          title: 'Trader inactive',
          message: `${t.address.slice(0, 6)}…${t.address.slice(-4)} has not traded for over ${Math.round(INACTIVE_AFTER_MS / DAY_MS)} days`,
          traderAddress: t.address,
        });
      }
    }
    return fresh.length;
  }
}
