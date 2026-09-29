import type {
  DataMode,
  LeaderboardEntry,
  MarketInfo,
  TimePeriod,
  TradeFill,
  TraderPosition,
} from '@polymirror/shared';

export type LeaderboardWindow = 'day' | 'week' | 'month' | 'all';

export interface TraderStats {
  /** Number of distinct markets traded (Data API `trades` field of /v2/user-stats). */
  marketsTraded: number | null;
  biggestWin: number | null;
  joinDate: number | null;
}

export interface FillQuery {
  /** Inclusive lower bound, epoch ms. */
  since?: number;
  /** Maximum number of fills to return (newest first). */
  maxFills?: number;
  conditionId?: string;
  side?: 'BUY' | 'SELL';
}

/**
 * Read-side boundary to Polymarket. Business logic depends only on this interface, so the data
 * source (demo generator, public Data API, a future official SDK) can be swapped freely.
 *
 * Implementations must only use officially supported, public endpoints and respect rate limits.
 */
export interface PolymarketAdapter {
  readonly mode: DataMode;
  readonly sourceName: string;

  /** Candidate discovery for the Whale Scanner. */
  listLeaderboard(params: {
    window: LeaderboardWindow;
    sortBy: 'VOLUME' | 'PNL';
    limit: number;
    category?: string;
  }): Promise<LeaderboardEntry[]>;

  /** Fills of a trader, newest first. */
  getTraderFills(address: string, query?: FillQuery): Promise<TradeFill[]>;

  /** Positions of a trader (open, closed and resolved). */
  getTraderPositions(address: string, fillsHint?: readonly TradeFill[]): Promise<TraderPosition[]>;

  getTraderStats(address: string): Promise<TraderStats | null>;

  getTraderProfile(address: string): Promise<{ userName: string | null; profileImage: string | null } | null>;

  getMarkets(conditionIds: readonly string[]): Promise<MarketInfo[]>;

  /** Current reference (mid) price of an outcome token, null when unavailable. */
  getCurrentPrice(tokenId: string): Promise<number | null>;

  /** Public URL where the user can place the order manually. */
  marketUrl(input: { eventSlug: string | null; marketSlug: string | null }): string | null;
}

export const periodToWindow = (p: TimePeriod): LeaderboardWindow =>
  p === '1d' ? 'day' : p === '7d' ? 'week' : p === '30d' ? 'month' : 'all';
