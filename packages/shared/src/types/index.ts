export * from './ws';
export * from './api';

/**
 * Domain types shared by the backend and the extension.
 *
 * Conventions:
 * - Money values are USDC numbers (Polymarket collateral), already converted from decimal strings.
 * - Timestamps are epoch milliseconds.
 * - `null` always means "not available / cannot be computed from real data" and is rendered as N/A.
 */

export type DataMode = 'demo' | 'live';

export type OrderSide = 'BUY' | 'SELL';

/** A single fill as reported by Polymarket (Data API `/v2/trades`) or the demo generator. */
export interface TradeFill {
  /** Stable, source-derived identifier used for de-duplication. */
  id: string;
  traderAddress: string;
  conditionId: string;
  tokenId: string;
  side: OrderSide;
  /** Outcome token amount. */
  size: number;
  /** Price per outcome token in USDC (0..1). */
  price: number;
  /** size * price. */
  notional: number;
  timestamp: number;
  marketTitle: string | null;
  marketSlug: string | null;
  eventSlug: string | null;
  outcome: string | null;
  outcomeIndex: number | null;
  transactionHash: string | null;
  category: string | null;
}

export type PositionStatus = 'OPEN' | 'CLOSED' | 'RESOLVED';

/** A position (round trip) of a trader in one outcome token. */
export interface TraderPosition {
  id: string;
  traderAddress: string;
  conditionId: string;
  tokenId: string;
  marketTitle: string | null;
  marketSlug: string | null;
  outcome: string | null;
  category: string | null;
  status: PositionStatus;
  /** Average entry price. */
  entryPrice: number | null;
  /** Average exit price (sell or resolution price) — null while fully open. */
  exitPrice: number | null;
  /** Total USDC spent to build the position. */
  cost: number;
  /** Realized + unrealized P/L in USDC. */
  pnl: number;
  realizedPnl: number;
  /** pnl / cost, null when cost is 0. */
  roi: number | null;
  openedAt: number | null;
  closedAt: number | null;
}

export interface MarketInfo {
  conditionId: string;
  question: string;
  slug: string | null;
  eventSlug: string | null;
  category: string | null;
  active: boolean;
  closed: boolean;
  outcomes: string[];
  tokenIds: string[];
  outcomePrices: number[];
  url: string | null;
}

export interface LeaderboardEntry {
  address: string;
  rank: number | null;
  userName: string | null;
  profileImage: string | null;
  pnl: number | null;
  volume: number | null;
}

/** Row in the Whale Scanner. Every metric is nullable: N/A when it cannot be derived from real data. */
export interface TraderSummary {
  address: string;
  userName: string | null;
  profileImage: string | null;
  totalVolume: number | null;
  tradeCount: number | null;
  averagePosition: number | null;
  largestTrade: number | null;
  pnl: number | null;
  roi: number | null;
  winRate: number | null;
  maxDrawdown: number | null;
  lastActive: number | null;
  categories: string[];
  /** true if the trader traded within the "active" window. */
  active: boolean | null;
  /** True when per-trader metrics (trades, ROI...) were computed, false when only leaderboard data is known. */
  enriched: boolean;
  isWatched: boolean;
}

export type TimePeriod = '1d' | '7d' | '30d' | '90d' | 'all';

export interface ScannerFilters {
  minTradeSize?: number;
  minTotalVolume?: number;
  minTrades?: number;
  period: TimePeriod;
  category?: string;
  activity?: 'active' | 'inactive' | 'any';
  minPnl?: number;
  minRoi?: number;
  minWinRate?: number;
  minAveragePosition?: number;
  maxDrawdown?: number;
  sortBy?: ScannerSortKey;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
}

export type ScannerSortKey =
  | 'totalVolume'
  | 'tradeCount'
  | 'averagePosition'
  | 'pnl'
  | 'roi'
  | 'winRate'
  | 'lastActive'
  | 'maxDrawdown';

export interface PerformanceMetrics {
  totalPnl: number | null;
  realizedPnl: number | null;
  roi: number | null;
  winRate: number | null;
  averagePnl: number | null;
  medianPnl: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  closedPositions: number;
  wins: number;
  losses: number;
}

export interface RiskMetrics {
  maxDrawdown: number | null;
  maxDrawdownPct: number | null;
  averagePositionSize: number | null;
  largestPosition: number | null;
  /** Share (0..1) of total volume placed in the single most traded market. */
  positionConcentration: number | null;
  openPositions: number;
  maxSimultaneousPositions: number | null;
}

export interface ActivityMetrics {
  totalTrades: number;
  totalVolume: number;
  /** Largest single fill notional. */
  largestTrade: number | null;
  tradesPerDay: number | null;
  tradesPerWeek: number | null;
  /** 24 buckets, UTC hour of day -> fill count. */
  activeHours: number[];
  averageHoldingTimeMs: number | null;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
}

export interface DistributionBucket {
  label: string;
  count: number;
  volume: number;
}

export interface TimeSeriesPoint {
  /** Epoch ms (day start in UTC for daily series). */
  t: number;
  value: number;
}

export interface TraderCharts {
  cumulativePnl: TimeSeriesPoint[];
  dailyPnl: TimeSeriesPoint[];
  dailyVolume: TimeSeriesPoint[];
  dailyTrades: TimeSeriesPoint[];
  drawdown: TimeSeriesPoint[];
  winLoss: DistributionBucket[];
  positionSizes: DistributionBucket[];
  categories: DistributionBucket[];
}

export interface TraderAnalytics {
  address: string;
  period: TimePeriod;
  performance: PerformanceMetrics;
  risk: RiskMetrics;
  activity: ActivityMetrics;
  charts: TraderCharts;
  /** Explanations for metrics that could not be computed. */
  notes: string[];
  computedAt: number;
}

export interface TraderProfile {
  address: string;
  userName: string | null;
  profileImage: string | null;
  totalVolume: number | null;
  tradeCount: number | null;
  averagePosition: number | null;
  largestPosition: number | null;
  pnl: number | null;
  roi: number | null;
  winRate: number | null;
  averageHoldingTimeMs: number | null;
  maxDrawdown: number | null;
  lastActive: number | null;
  categories: string[];
  marketsTraded: number | null;
  joinDate: number | null;
  isWatched: boolean;
  watchlistId: string | null;
}

export interface HistoricalTradeRow {
  id: string;
  date: number | null;
  market: string | null;
  marketSlug: string | null;
  side: OrderSide | 'POSITION';
  outcome: string | null;
  entry: number | null;
  exit: number | null;
  positionSize: number;
  pnl: number | null;
  roi: number | null;
  status: PositionStatus;
  category: string | null;
}

export interface HistoricalTradesQuery {
  page?: number;
  pageSize?: number;
  sortBy?: 'date' | 'positionSize' | 'pnl' | 'roi' | 'market';
  sortDirection?: 'asc' | 'desc';
  search?: string;
  status?: PositionStatus | 'ALL';
  from?: number;
  to?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export type WatchStatus = 'ACTIVE' | 'PAUSED';

export interface WatchlistItem {
  id: string;
  traderAddress: string;
  userName: string | null;
  status: WatchStatus;
  lastTradeAt: number | null;
  totalVolume: number | null;
  pnl: number | null;
  roi: number | null;
  newTrades: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Copy trading
// ---------------------------------------------------------------------------

export type CopyMode = 'MANUAL' | 'AUTOMATIC';
export type CopySizingMode = 'FIXED' | 'PERCENTAGE';

export interface CopySettings {
  mode: CopyMode;
  sizingMode: CopySizingMode;
  /** Fixed USDC amount per copied trade. */
  fixedAmount: number;
  /** Percentage of the whale's trade notional (e.g. 0.01 means 0.01%). */
  percentage: number;
  minCopyAmount: number;
  /** MAX_COPY_AMOUNT: maximum per trade. */
  maxPerTrade: number;
  /** MAX_DAILY_COPY_VOLUME. */
  maxDailyAmount: number;
  /** MAX_OPEN_POSITIONS. */
  maxOpenPositions: number;
  /** MIN_WHALE_TRADE_SIZE. */
  minWhaleTrade: number;
  /** MAX_SLIPPAGE as a fraction of price (0.02 = 2%). */
  maxSlippage: number;
  /** MIN_BALANCE the wallet must keep after the copy. */
  minBalance: number;
  /** CONFIRMATION_REQUIRED — forced to true unless the user enabled AUTOMATIC mode. */
  confirmationRequired: boolean;
  /** Empty means all categories are allowed. */
  allowedCategories: string[];
  /** Market condition ids or slugs that must never be copied. */
  excludedMarkets: string[];
  /** The user's public Polymarket wallet address, used to verify assisted fills. */
  walletAddress: string | null;
  updatedAt: number;
}

export type CopyOrderStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'SKIPPED'
  | 'FAILED'
  | 'CANCELLED';

/** User-facing status labels. */
export type CopyDisplayStatus = 'Pending' | 'Copied' | 'Skipped' | 'Failed' | 'Cancelled';

export type ExecutionKind = 'demo' | 'assisted';

export interface CopyOrder {
  id: string;
  userId: string;
  traderAddress: string;
  sourceTradeId: string;
  conditionId: string;
  tokenId: string;
  marketTitle: string | null;
  marketUrl: string | null;
  outcome: string | null;
  side: OrderSide;
  whaleSize: number;
  whalePrice: number;
  amount: number;
  estimatedShares: number;
  status: CopyOrderStatus;
  execution: ExecutionKind;
  failureReason: string | null;
  externalOrderId: string | null;
  transactionHash: string | null;
  fillPrice: number | null;
  filledShares: number | null;
  currentPrice: number | null;
  pnl: number | null;
  closedAt: number | null;
  createdAt: number;
  executedAt: number | null;
  expiresAt: number;
}

export type LimitCode =
  | 'MAX_COPY_AMOUNT'
  | 'MIN_COPY_AMOUNT'
  | 'MAX_DAILY_COPY_VOLUME'
  | 'MAX_OPEN_POSITIONS'
  | 'MIN_WHALE_TRADE_SIZE'
  | 'MAX_SLIPPAGE'
  | 'MIN_BALANCE'
  | 'CONFIRMATION_REQUIRED'
  | 'CATEGORY_NOT_ALLOWED'
  | 'MARKET_EXCLUDED'
  | 'TRADE_TOO_OLD'
  | 'MARKET_UNAVAILABLE'
  | 'SIDE_NOT_SUPPORTED'
  | 'INVALID_PRICE';

export interface LimitCheck {
  code: LimitCode;
  passed: boolean;
  /** 'unknown' when the input needed to check is unavailable (e.g. balance in assisted mode). */
  state: 'pass' | 'fail' | 'unknown';
  message: string;
}

export interface CopyPreview {
  copyOrderId: string | null;
  sourceTradeId: string;
  traderAddress: string;
  marketTitle: string | null;
  marketUrl: string | null;
  outcome: string | null;
  side: OrderSide;
  whaleSize: number;
  whalePrice: number;
  currentPrice: number | null;
  amount: number;
  estimatedShares: number;
  checks: LimitCheck[];
  allowed: boolean;
  execution: ExecutionKind;
  dailyUsed: number;
  dailyRemaining: number;
  openPositions: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface UserStatistics {
  totalCopied: number;
  totalSkipped: number;
  totalFailed: number;
  totalPending: number;
  totalVolume: number;
  totalPnl: number | null;
  roi: number | null;
  winRate: number | null;
  averageTrade: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number | null;
  todayVolume: number;
  cumulativePnl: TimeSeriesPoint[];
}

export interface DashboardSummary {
  mode: DataMode;
  trackedTraders: number;
  newTrades: number;
  copiedTrades: number;
  skippedTrades: number;
  todayCopiedVolume: number;
  pnl: number | null;
  pendingConfirmations: number;
  recentEvents: NotificationItem[];
}

export interface PerformanceComparison {
  traderAddress: string;
  trader: ComparisonSide;
  user: ComparisonSide;
  /** Number of the user's copies of this trader used for the user side. */
  copiedTrades: number;
  disclaimer: string;
}

export interface ComparisonSide {
  roi: number | null;
  pnl: number | null;
  winRate: number | null;
  maxDrawdown: number | null;
}

// ---------------------------------------------------------------------------
// Notifications & realtime
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'WHALE_TRADE'
  | 'COPY_SUCCESS'
  | 'COPY_FAILED'
  | 'COPY_SKIPPED'
  | 'DAILY_LIMIT_REACHED'
  | 'TRADER_INACTIVE'
  | 'CONNECTION_LOST'
  | 'MARKET_UNAVAILABLE'
  | 'INSUFFICIENT_BALANCE';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  traderAddress: string | null;
  copyOrderId: string | null;
  read: boolean;
  createdAt: number;
}

export interface DetectedTrade {
  trade: TradeFill;
  traderAddress: string;
  detectedAt: number;
}

export interface SystemInfo {
  mode: DataMode;
  execution: ExecutionKind;
  supportsProgrammaticExecution: boolean;
  version: string;
  serverTime: number;
}
