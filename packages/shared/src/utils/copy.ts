import { MIN_ORDER_AMOUNT, SAFETY_LIMITS } from '../constants';
import type { CopySettings } from '../types';
import { floorTo } from './math';

export type CopySizingSettings = Pick<
  CopySettings,
  'sizingMode' | 'fixedAmount' | 'percentage' | 'minCopyAmount' | 'maxPerTrade'
>;

export interface CopyAmountResult {
  /** Final order amount in USDC. Never derived from anything but the user's own settings. */
  amount: number;
  /** Amount before min/max clamping. */
  rawAmount: number;
  clampedBy: 'MIN' | 'MAX' | null;
}

/**
 * Computes the user's order amount for a whale trade.
 *
 * FIXED:      amount = fixedAmount (the whale's size is irrelevant).
 * PERCENTAGE: amount = whaleNotional * percentage / 100 (percentage = 0.01 means 0.01%).
 *
 * The result is clamped to [minCopyAmount, min(maxPerTrade, MAX_COPY_AMOUNT)] and floored to cents,
 * so it can never exceed a configured maximum.
 */
export function calculateCopyAmount(
  settings: CopySizingSettings,
  whaleNotional: number,
): CopyAmountResult {
  const raw =
    settings.sizingMode === 'FIXED'
      ? settings.fixedAmount
      : (Math.max(0, whaleNotional) * settings.percentage) / 100;

  const max = Math.min(settings.maxPerTrade, SAFETY_LIMITS.MAX_COPY_AMOUNT);
  const min = Math.max(settings.minCopyAmount, 0);
  let amount = raw;
  let clampedBy: CopyAmountResult['clampedBy'] = null;
  if (amount > max) {
    amount = max;
    clampedBy = 'MAX';
  } else if (amount < min) {
    amount = min;
    clampedBy = 'MIN';
  }
  return { amount: floorTo(Math.min(amount, max)), rawAmount: raw, clampedBy };
}

/** Estimated outcome shares for a BUY of `amount` USDC at `price`. */
export function estimateShares(amount: number, price: number): number {
  if (!(price > 0) || !(amount > 0)) return 0;
  return floorTo(amount / price, 4);
}

export function isValidOrderAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= MIN_ORDER_AMOUNT;
}

/**
 * Clamps user supplied settings to the hard safety ceilings. Applied on every write.
 */
export function enforceSafetyCeilings<T extends Omit<CopySettings, 'updatedAt'>>(settings: T): T {
  const maxPerTrade = Math.min(settings.maxPerTrade, SAFETY_LIMITS.MAX_COPY_AMOUNT);
  return {
    ...settings,
    fixedAmount: Math.min(settings.fixedAmount, SAFETY_LIMITS.MAX_COPY_AMOUNT),
    maxPerTrade,
    minCopyAmount: Math.min(settings.minCopyAmount, maxPerTrade),
    maxDailyAmount: Math.min(settings.maxDailyAmount, SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME),
    maxOpenPositions: Math.min(settings.maxOpenPositions, SAFETY_LIMITS.MAX_OPEN_POSITIONS),
    minWhaleTrade: Math.max(settings.minWhaleTrade, SAFETY_LIMITS.MIN_WHALE_TRADE_SIZE),
    maxSlippage: Math.min(settings.maxSlippage, SAFETY_LIMITS.MAX_SLIPPAGE),
    minBalance: Math.max(settings.minBalance, SAFETY_LIMITS.MIN_BALANCE),
    // Manual mode can never disable confirmations.
    confirmationRequired: settings.mode === 'MANUAL' ? true : settings.confirmationRequired,
  };
}
