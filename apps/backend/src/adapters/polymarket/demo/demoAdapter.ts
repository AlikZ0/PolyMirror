import { DAY_MS, TIME_PERIOD_MS, sum } from '@polymirror/shared';
import type { LeaderboardEntry, MarketInfo, TradeFill, TraderPosition } from '@polymirror/shared';
import type { FillQuery, LeaderboardWindow, PolymarketAdapter, TraderStats } from '../types';
import { DemoWorld } from './demoWorld';

const WINDOW_MS: Record<LeaderboardWindow, number | null> = {
  day: TIME_PERIOD_MS['1d'],
  week: TIME_PERIOD_MS['7d'],
  month: TIME_PERIOD_MS['30d'],
  all: null,
};

/** DEMO MODE data source. Never talks to the network; never used for real execution. */
export class DemoPolymarketAdapter implements PolymarketAdapter {
  readonly mode = 'demo' as const;
  readonly sourceName = 'PolyMirror demo generator';
  readonly world: DemoWorld;

  constructor(
    private readonly now: () => number = Date.now,
    startedAt = now(),
  ) {
    this.world = new DemoWorld(startedAt);
  }

  async listLeaderboard(params: {
    window: LeaderboardWindow;
    sortBy: 'VOLUME' | 'PNL';
    limit: number;
    category?: string;
  }): Promise<LeaderboardEntry[]> {
    const now = this.now();
    const len = WINDOW_MS[params.window];
    const start = len === null ? 0 : now - len;
    const rows = this.world.traders.map((t) => {
      const fills = this.world
        .allFills(t.address, now)
        .filter(
          (f) => f.timestamp >= start && (!params.category || f.category === params.category),
        );
      const positions = this.world
        .positions(t.address, now)
        .filter((p) => (p.closedAt ?? p.openedAt ?? 0) >= start);
      return {
        address: t.address,
        rank: null as number | null,
        userName: t.userName,
        profileImage: null,
        volume: sum(fills.map((f) => f.notional)),
        pnl: sum(positions.map((p) => p.pnl)),
      };
    });
    rows.sort((a, b) => (params.sortBy === 'PNL' ? b.pnl - a.pnl : b.volume - a.volume));
    return rows.slice(0, params.limit).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async getTraderFills(address: string, query: FillQuery = {}): Promise<TradeFill[]> {
    const now = this.now();
    let fills = this.world.allFills(address, now);
    if (query.since !== undefined) fills = fills.filter((f) => f.timestamp >= query.since!);
    if (query.conditionId) fills = fills.filter((f) => f.conditionId === query.conditionId);
    if (query.side) fills = fills.filter((f) => f.side === query.side);
    fills.sort((a, b) => b.timestamp - a.timestamp);
    return fills.slice(0, query.maxFills ?? fills.length);
  }

  async getTraderPositions(address: string): Promise<TraderPosition[]> {
    return this.world.positions(address, this.now());
  }

  async getTraderStats(address: string): Promise<TraderStats | null> {
    const t = this.world.trader(address);
    if (!t) return null;
    const fills = this.world.allFills(address, this.now());
    const positions = this.world.positions(address, this.now());
    return {
      marketsTraded: new Set(fills.map((f) => f.conditionId)).size,
      biggestWin: positions.length ? Math.max(0, ...positions.map((p) => p.pnl)) : null,
      joinDate: this.world.startedAt - 120 * DAY_MS,
    };
  }

  async getTraderProfile(address: string) {
    const t = this.world.trader(address);
    return t ? { userName: t.userName, profileImage: null } : null;
  }

  async getMarkets(conditionIds: readonly string[]): Promise<MarketInfo[]> {
    const now = this.now();
    return conditionIds
      .map((id) => this.world.market(id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
      .map((m) => {
        const resolved = m.resolvesAt !== null && m.resolvesAt <= now;
        return {
          conditionId: m.conditionId,
          question: m.question,
          slug: m.slug,
          eventSlug: m.eventSlug,
          category: m.category,
          active: !resolved,
          closed: resolved,
          outcomes: m.outcomes,
          tokenIds: m.tokenIds,
          outcomePrices: m.tokenIds.map((_, i) => this.world.priceAt(m, i, now)),
          url: null,
        };
      });
  }

  async getCurrentPrice(tokenId: string): Promise<number | null> {
    const p = this.world.tokenPrice(tokenId, this.now());
    return p !== null && p > 0 && p < 1 ? p : null;
  }

  marketUrl(): string | null {
    // Demo markets do not exist on Polymarket.
    return null;
  }
}
