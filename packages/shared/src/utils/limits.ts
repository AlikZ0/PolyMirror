import { MIN_ORDER_AMOUNT, SAFETY_LIMITS } from '../constants';
import type { CopySettings, LimitCheck, LimitCode, OrderSide } from '../types';
import { formatPct, formatUsd } from './format';

export interface LimitContext {
  settings: Omit<CopySettings, 'updatedAt'>;
  amount: number;
  side: OrderSide;
  whaleNotional: number;
  whalePrice: number;
  /** Current executable price; null when unknown. */
  currentPrice: number | null;
  /** Volume already committed today (confirmed + in-flight copies). */
  dailyUsed: number;
  /** Currently open copied positions (confirmed + in-flight). */
  openPositions: number;
  /** Available balance; null when it cannot be read (assisted mode). */
  balance: number | null;
  category: string | null;
  conditionId: string;
  marketSlug: string | null;
  tradeTimestamp: number;
  now: number;
  maxTradeAgeMs: number;
  /** false = market closed/unavailable, null = unknown. */
  marketActive: boolean | null;
  /** True only when the user explicitly confirmed this specific order. */
  userConfirmed: boolean;
}

const check = (code: LimitCode, state: LimitCheck['state'], message: string): LimitCheck => ({
  code,
  state,
  passed: state !== 'fail',
  message,
});

/**
 * Evaluates every safety limit. Must be called (server side) immediately before an order is sent;
 * if any check fails the order must not be sent.
 */
export function evaluateCopyLimits(ctx: LimitContext): LimitCheck[] {
  const s = ctx.settings;
  const checks: LimitCheck[] = [];
  const maxPerTrade = Math.min(s.maxPerTrade, SAFETY_LIMITS.MAX_COPY_AMOUNT);
  const maxDaily = Math.min(s.maxDailyAmount, SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME);
  const maxOpen = Math.min(s.maxOpenPositions, SAFETY_LIMITS.MAX_OPEN_POSITIONS);
  const minAmount = Math.max(s.minCopyAmount, MIN_ORDER_AMOUNT);

  checks.push(
    ctx.side === 'BUY'
      ? check('SIDE_NOT_SUPPORTED', 'pass', 'Buy orders are supported')
      : check(
          'SIDE_NOT_SUPPORTED',
          'fail',
          'The trader reduced a position (SELL). PolyMirror only mirrors entries; close your copy manually.',
        ),
  );

  const priceOk = ctx.whalePrice > 0 && ctx.whalePrice < 1;
  checks.push(
    check(
      'INVALID_PRICE',
      priceOk ? 'pass' : 'fail',
      priceOk ? 'Price is valid' : 'Price out of range (0, 1)',
    ),
  );

  checks.push(
    ctx.whaleNotional >= s.minWhaleTrade
      ? check('MIN_WHALE_TRADE_SIZE', 'pass', `Trader size ≥ ${formatUsd(s.minWhaleTrade)}`)
      : check(
          'MIN_WHALE_TRADE_SIZE',
          'fail',
          `Trader size ${formatUsd(ctx.whaleNotional)} is below your minimum ${formatUsd(s.minWhaleTrade)}`,
        ),
  );

  checks.push(
    ctx.amount <= maxPerTrade
      ? check('MAX_COPY_AMOUNT', 'pass', `Amount ≤ ${formatUsd(maxPerTrade)} per trade`)
      : check(
          'MAX_COPY_AMOUNT',
          'fail',
          `Amount exceeds the per-trade maximum ${formatUsd(maxPerTrade)}`,
        ),
  );

  checks.push(
    ctx.amount >= minAmount
      ? check('MIN_COPY_AMOUNT', 'pass', `Amount ≥ ${formatUsd(minAmount)}`)
      : check('MIN_COPY_AMOUNT', 'fail', `Amount is below the minimum ${formatUsd(minAmount)}`),
  );

  const dailyAfter = ctx.dailyUsed + ctx.amount;
  checks.push(
    dailyAfter <= maxDaily + 1e-9
      ? check(
          'MAX_DAILY_COPY_VOLUME',
          'pass',
          `Daily volume ${formatUsd(dailyAfter)} / ${formatUsd(maxDaily)}`,
        )
      : check(
          'MAX_DAILY_COPY_VOLUME',
          'fail',
          `Daily limit reached: ${formatUsd(ctx.dailyUsed)} used of ${formatUsd(maxDaily)}`,
        ),
  );

  checks.push(
    ctx.openPositions < maxOpen
      ? check(
          'MAX_OPEN_POSITIONS',
          'pass',
          `Open copied positions ${ctx.openPositions} / ${maxOpen}`,
        )
      : check('MAX_OPEN_POSITIONS', 'fail', `Maximum open copied positions reached (${maxOpen})`),
  );

  if (ctx.currentPrice === null) {
    checks.push(
      check('MAX_SLIPPAGE', 'unknown', 'Current price unavailable — slippage cannot be verified'),
    );
  } else {
    const slippage =
      ctx.whalePrice > 0 ? (ctx.currentPrice - ctx.whalePrice) / ctx.whalePrice : Infinity;
    checks.push(
      slippage <= s.maxSlippage + 1e-9
        ? check(
            'MAX_SLIPPAGE',
            'pass',
            `Price moved ${formatPct(slippage, { signed: true })} (max ${formatPct(s.maxSlippage)})`,
          )
        : check(
            'MAX_SLIPPAGE',
            'fail',
            `Price moved ${formatPct(slippage, { signed: true })}, above your max slippage ${formatPct(s.maxSlippage)}`,
          ),
    );
  }

  if (ctx.balance === null) {
    checks.push(
      check(
        'MIN_BALANCE',
        'unknown',
        'Balance cannot be read in this mode — check it on Polymarket',
      ),
    );
  } else {
    const after = ctx.balance - ctx.amount;
    checks.push(
      after >= s.minBalance
        ? check('MIN_BALANCE', 'pass', `Balance after order ${formatUsd(after)}`)
        : check('MIN_BALANCE', 'fail', `Insufficient balance: ${formatUsd(ctx.balance)} available`),
    );
  }

  if (s.allowedCategories.length === 0) {
    checks.push(check('CATEGORY_NOT_ALLOWED', 'pass', 'All categories allowed'));
  } else {
    const allowed =
      ctx.category !== null &&
      s.allowedCategories.some((c) => c.toLowerCase() === ctx.category!.toLowerCase());
    checks.push(
      allowed
        ? check('CATEGORY_NOT_ALLOWED', 'pass', `Category ${ctx.category} allowed`)
        : check(
            'CATEGORY_NOT_ALLOWED',
            'fail',
            `Category ${ctx.category ?? 'unknown'} is not in your allowed list`,
          ),
    );
  }

  const excluded = s.excludedMarkets.some((m) => {
    const v = m.toLowerCase();
    return (
      v === ctx.conditionId.toLowerCase() ||
      (ctx.marketSlug !== null && v === ctx.marketSlug.toLowerCase())
    );
  });
  checks.push(
    excluded
      ? check('MARKET_EXCLUDED', 'fail', 'This market is in your excluded list')
      : check('MARKET_EXCLUDED', 'pass', 'Market not excluded'),
  );

  const age = ctx.now - ctx.tradeTimestamp;
  checks.push(
    age <= ctx.maxTradeAgeMs
      ? check('TRADE_TOO_OLD', 'pass', 'Trade is fresh')
      : check(
          'TRADE_TOO_OLD',
          'fail',
          `Trade is ${Math.round(age / 1000)}s old — too stale to copy`,
        ),
  );

  checks.push(
    ctx.marketActive === false
      ? check('MARKET_UNAVAILABLE', 'fail', 'Market is closed or unavailable')
      : ctx.marketActive === null
        ? check('MARKET_UNAVAILABLE', 'unknown', 'Market status unknown')
        : check('MARKET_UNAVAILABLE', 'pass', 'Market is open'),
  );

  const autoAllowed = s.mode === 'AUTOMATIC' && !s.confirmationRequired;
  checks.push(
    ctx.userConfirmed || autoAllowed
      ? check(
          'CONFIRMATION_REQUIRED',
          'pass',
          ctx.userConfirmed ? 'Confirmed by you' : 'Automatic mode enabled',
        )
      : check('CONFIRMATION_REQUIRED', 'fail', 'Your confirmation is required'),
  );

  return checks;
}

/** Checks relevant to *proposing* a copy (confirmation is requested afterwards). */
export function proposalChecks(checks: readonly LimitCheck[]): LimitCheck[] {
  return checks.filter((c) => c.code !== 'CONFIRMATION_REQUIRED');
}

/**
 * Whether an order may be sent.
 * strict = true additionally rejects 'unknown' checks (used for automatic execution, where no human
 * reviewed the unknowns).
 */
export function canExecute(checks: readonly LimitCheck[], strict = false): boolean {
  return checks.every((c) => (strict ? c.state === 'pass' : c.state !== 'fail'));
}

export function failedChecks(checks: readonly LimitCheck[]): LimitCheck[] {
  return checks.filter((c) => c.state === 'fail');
}
