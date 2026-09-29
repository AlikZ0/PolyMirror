import type { CopySettings, TimePeriod } from '../types';

/**
 * Hard safety ceilings. User settings are clamped to these values on the server,
 * so a compromised or buggy client can never raise them.
 */
export const SAFETY_LIMITS = {
  MAX_COPY_AMOUNT: 1_000,
  MAX_DAILY_COPY_VOLUME: 10_000,
  MAX_OPEN_POSITIONS: 50,
  MIN_WHALE_TRADE_SIZE: 0,
  MAX_SLIPPAGE: 0.25,
  MIN_BALANCE: 0,
  CONFIRMATION_REQUIRED: true,
} as const;

/** Absolute minimum order Polymarket-style markets accept in PolyMirror (USDC). */
export const MIN_ORDER_AMOUNT = 1;

export const DEFAULT_COPY_SETTINGS: Omit<CopySettings, 'updatedAt'> = {
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
};

export const TIME_PERIOD_MS: Record<TimePeriod, number | null> = {
  '1d': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  all: null,
};

export const DAY_MS = 86_400_000;

/** A trader without fills in this window is reported as inactive. */
export const INACTIVE_AFTER_MS = 7 * DAY_MS;

/** How long a pending copy proposal stays actionable. */
export const COPY_PROPOSAL_TTL_MS = 3 * 60_000;

export const COMPARISON_DISCLAIMER =
  'Statistical comparison of historical results only. Past performance does not predict future results and this is not investment advice.';

export const DEMO_BANNER = 'DEMO MODE — generated data, no real trades are ever executed.';

export const POSITION_SIZE_BUCKETS = [
  { label: '< $100', max: 100 },
  { label: '$100–1k', max: 1_000 },
  { label: '$1k–10k', max: 10_000 },
  { label: '$10k–100k', max: 100_000 },
  { label: '≥ $100k', max: Number.POSITIVE_INFINITY },
] as const;
