import type {
  CopySettings,
  DashboardSummary,
  HistoricalTradeRow,
  PerformanceComparison,
  SystemInfo,
  TraderAnalytics,
  TraderProfile,
  TraderSummary,
  UserStatistics,
} from '@polymirror/shared';
import { makeOrder, makePreview, WHALE } from '../src/test/fixtures';

export { WHALE };
export const WHALE_2 = '0x2222222222222222222222222222222222222222';
const DAY = 86_400_000;

export const system = (): SystemInfo => ({
  mode: 'demo',
  execution: 'demo',
  supportsProgrammaticExecution: true,
  version: '0.1.0-mock',
  serverTime: Date.now(),
});

export const traders = (): TraderSummary[] => [
  {
    address: WHALE,
    userName: 'BigWhale',
    profileImage: null,
    totalVolume: 4_250_000,
    tradeCount: 812,
    averagePosition: 5_234,
    largestTrade: 250_000,
    pnl: 312_000,
    roi: 0.073,
    winRate: 0.58,
    maxDrawdown: 88_000,
    lastActive: Date.now() - 3_600_000,
    categories: ['Crypto', 'Politics'],
    active: true,
    enriched: true,
    isWatched: true,
  },
  {
    address: WHALE_2,
    userName: null,
    profileImage: null,
    totalVolume: 1_900_000,
    tradeCount: null,
    averagePosition: null,
    largestTrade: null,
    pnl: 45_000,
    roi: null,
    winRate: null,
    maxDrawdown: null,
    lastActive: null,
    categories: [],
    active: null,
    enriched: false,
    isWatched: false,
  },
];

export const profile = (address: string): TraderProfile => ({
  address,
  userName: address === WHALE ? 'BigWhale' : null,
  profileImage: null,
  totalVolume: 4_250_000,
  tradeCount: 812,
  averagePosition: 5_234,
  largestPosition: 250_000,
  pnl: 312_000,
  roi: 0.073,
  winRate: 0.58,
  averageHoldingTimeMs: 3 * DAY,
  maxDrawdown: 88_000,
  lastActive: Date.now() - 3_600_000,
  categories: ['Crypto', 'Politics'],
  marketsTraded: 64,
  joinDate: Date.now() - 400 * DAY,
  isWatched: address === WHALE,
  watchlistId: address === WHALE ? 'w-1' : null,
});

export const trades = (): HistoricalTradeRow[] =>
  Array.from({ length: 30 }, (_, i) => ({
    id: `t-${i}`,
    date: Date.now() - i * DAY,
    market: i % 2 ? 'Will ETH flip BTC in 2026?' : 'US Election: Party X wins?',
    marketSlug: null,
    side: i % 3 ? 'BUY' : 'SELL',
    outcome: 'Yes',
    entry: 0.4 + (i % 5) * 0.05,
    exit: i < 3 ? null : 0.5,
    positionSize: 10_000 + i * 1000,
    pnl: i < 3 ? null : (i % 2 ? 1 : -1) * 1_000 * (i % 7),
    roi: i < 3 ? null : (i % 2 ? 1 : -1) * 0.05,
    status: i < 3 ? 'OPEN' : 'CLOSED',
    category: i % 2 ? 'Crypto' : 'Politics',
  }));

export const analytics = (address: string): TraderAnalytics => {
  const series = (f: (i: number) => number) =>
    Array.from({ length: 14 }, (_, i) => ({ t: Date.now() - (13 - i) * DAY, value: f(i) }));
  return {
    address,
    period: 'all',
    performance: {
      totalPnl: 312_000,
      realizedPnl: 280_000,
      roi: 0.073,
      winRate: 0.58,
      averagePnl: 384,
      medianPnl: 120,
      bestTrade: 42_000,
      worstTrade: -31_000,
      closedPositions: 700,
      wins: 406,
      losses: 294,
    },
    risk: {
      maxDrawdown: 88_000,
      maxDrawdownPct: 0.12,
      averagePositionSize: 5_234,
      largestPosition: 250_000,
      positionConcentration: 0.18,
      openPositions: 12,
      maxSimultaneousPositions: 31,
    },
    activity: {
      totalTrades: 812,
      totalVolume: 4_250_000,
      largestTrade: 250_000,
      tradesPerDay: 2.2,
      tradesPerWeek: 15.6,
      activeHours: Array.from({ length: 24 }, (_, h) => (h >= 13 && h <= 22 ? 30 + h : 5)),
      averageHoldingTimeMs: 3 * DAY,
      firstTradeAt: Date.now() - 400 * DAY,
      lastTradeAt: Date.now() - 3_600_000,
    },
    charts: {
      cumulativePnl: series((i) => i * 20_000 - 30_000),
      dailyPnl: series((i) => (i % 3 === 0 ? -8_000 : 12_000)),
      dailyVolume: series((i) => 100_000 + i * 5_000),
      dailyTrades: series((i) => 2 + (i % 4)),
      drawdown: series((i) => -(i % 5) * 4_000),
      winLoss: [
        { label: 'Wins', count: 406, volume: 2_000_000 },
        { label: 'Losses', count: 294, volume: 1_500_000 },
      ],
      positionSizes: [
        { label: '< $100', count: 10, volume: 500 },
        { label: '$100–1k', count: 120, volume: 60_000 },
        { label: '$1k–10k', count: 500, volume: 2_000_000 },
        { label: '$10k–100k', count: 170, volume: 1_800_000 },
        { label: '≥ $100k', count: 12, volume: 1_500_000 },
      ],
      categories: [
        { label: 'Crypto', count: 500, volume: 2_500_000 },
        { label: 'Politics', count: 312, volume: 1_750_000 },
      ],
    },
    notes: ['Average holding time only includes fully closed positions.'],
    computedAt: Date.now(),
  };
};

export const pendingItem = () => {
  const order = makeOrder({ expiresAt: Date.now() + 10 * 60_000 });
  const preview = makePreview({ expiresAt: order.expiresAt });
  return { order, preview };
};

export const dashboard = (): DashboardSummary => ({
  mode: 'demo',
  trackedTraders: 1,
  newTrades: 4,
  copiedTrades: 3,
  skippedTrades: 1,
  todayCopiedVolume: 30,
  pnl: 2.4,
  pendingConfirmations: 1,
  recentEvents: [
    {
      id: 'n-1',
      type: 'WHALE_TRADE',
      title: 'BigWhale opened a position',
      message: 'BUY Yes · $100,000',
      traderAddress: WHALE,
      copyOrderId: 'order-1',
      read: false,
      createdAt: Date.now() - 60_000,
    },
    {
      id: 'n-2',
      type: 'COPY_SUCCESS',
      title: 'Copied $10',
      message: 'Will ETH flip BTC in 2026?',
      traderAddress: WHALE,
      copyOrderId: 'order-0',
      read: true,
      createdAt: Date.now() - 3_600_000,
    },
  ],
});

export const copySettings = (): CopySettings => ({
  mode: 'MANUAL',
  sizingMode: 'FIXED',
  fixedAmount: 10,
  percentage: 0.01,
  minCopyAmount: 1,
  maxPerTrade: 20,
  maxDailyAmount: 100,
  maxOpenPositions: 5,
  minWhaleTrade: 10_000,
  maxSlippage: 0.03,
  minBalance: 0,
  confirmationRequired: true,
  allowedCategories: [],
  excludedMarkets: [],
  walletAddress: null,
  updatedAt: Date.now(),
});

export const statistics = (): UserStatistics => ({
  totalCopied: 3,
  totalSkipped: 1,
  totalFailed: 0,
  totalPending: 1,
  totalVolume: 30,
  totalPnl: 2.4,
  roi: 0.08,
  winRate: 0.66,
  averageTrade: 10,
  bestTrade: 2,
  worstTrade: -0.6,
  maxDrawdown: 0.6,
  todayVolume: 30,
  cumulativePnl: [
    { t: Date.now() - 2 * DAY, value: 1 },
    { t: Date.now() - DAY, value: 0.4 },
    { t: Date.now(), value: 2.4 },
  ],
});

export const performance = (address: string): PerformanceComparison => ({
  traderAddress: address,
  trader: { roi: 0.073, pnl: 312_000, winRate: 0.58, maxDrawdown: 88_000 },
  user: { roi: 0.08, pnl: 2.4, winRate: 0.66, maxDrawdown: 0.6 },
  copiedTrades: 3,
  disclaimer:
    'Statistical comparison of historical results only. Past performance does not predict future results and this is not investment advice.',
});
