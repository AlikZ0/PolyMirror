import { describe, expect, it } from 'vitest';
import { DEFAULT_COPY_SETTINGS, SAFETY_LIMITS } from '../constants';
import { calculateCopyAmount, enforceSafetyCeilings, estimateShares } from '../utils/copy';
import { canExecute, evaluateCopyLimits, failedChecks, proposalChecks } from '../utils/limits';
import { copyIdempotencyKey, fillId } from '../utils/ids';
import { limitCtx } from './fixtures';

const base = { ...DEFAULT_COPY_SETTINGS };

describe('Copy amount', () => {
  it('uses the fixed amount regardless of the whale size', () => {
    const r = calculateCopyAmount({ ...base, sizingMode: 'FIXED', fixedAmount: 10 }, 100_000);
    expect(r.amount).toBe(10);
    expect(r.amount).not.toBe(100_000);
  });

  it('never copies the whale notional even for huge trades', () => {
    for (const whale of [1, 1_000, 100_000, 50_000_000]) {
      const r = calculateCopyAmount({ ...base, fixedAmount: 10, maxPerTrade: 20 }, whale);
      expect(r.amount).toBeLessThanOrEqual(20);
    }
  });
});

describe('Percentage calculation', () => {
  it('0.01% of $100,000 is $10', () => {
    const r = calculateCopyAmount(
      { ...base, sizingMode: 'PERCENTAGE', percentage: 0.01, maxPerTrade: 20, minCopyAmount: 1 },
      100_000,
    );
    expect(r.amount).toBe(10);
    expect(r.clampedBy).toBeNull();
  });

  it('raises tiny amounts to the minimum copy amount', () => {
    const r = calculateCopyAmount(
      { ...base, sizingMode: 'PERCENTAGE', percentage: 0.01, minCopyAmount: 2 },
      1_000,
    );
    expect(r.rawAmount).toBeCloseTo(0.1);
    expect(r.amount).toBe(2);
    expect(r.clampedBy).toBe('MIN');
  });

  it('floors to cents so limits are never exceeded', () => {
    const r = calculateCopyAmount(
      { ...base, sizingMode: 'PERCENTAGE', percentage: 0.0123, maxPerTrade: 50 },
      123_456,
    );
    expect(r.amount).toBe(15.18);
  });
});

describe('Maximum trade limit', () => {
  it('clamps the computed amount to maxPerTrade', () => {
    const r = calculateCopyAmount(
      { ...base, sizingMode: 'PERCENTAGE', percentage: 1, maxPerTrade: 20 },
      100_000,
    );
    expect(r.amount).toBe(20);
    expect(r.clampedBy).toBe('MAX');
  });

  it('clamps to the hard MAX_COPY_AMOUNT ceiling', () => {
    const r = calculateCopyAmount({ ...base, fixedAmount: 1e9, maxPerTrade: 1e9 }, 1);
    expect(r.amount).toBe(SAFETY_LIMITS.MAX_COPY_AMOUNT);
  });

  it('fails the MAX_COPY_AMOUNT check when an order exceeds the maximum', () => {
    const checks = evaluateCopyLimits(limitCtx({ amount: 25 }));
    expect(failedChecks(checks).map((c) => c.code)).toEqual(['MAX_COPY_AMOUNT']);
    expect(canExecute(checks)).toBe(false);
  });

  it('enforceSafetyCeilings clamps settings and forces confirmation in manual mode', () => {
    const s = enforceSafetyCeilings({
      ...base,
      mode: 'MANUAL',
      confirmationRequired: false,
      maxPerTrade: 1e9,
      maxDailyAmount: 1e9,
      maxOpenPositions: 1e6,
      maxSlippage: 5,
    });
    expect(s.maxPerTrade).toBe(SAFETY_LIMITS.MAX_COPY_AMOUNT);
    expect(s.maxDailyAmount).toBe(SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME);
    expect(s.maxOpenPositions).toBe(SAFETY_LIMITS.MAX_OPEN_POSITIONS);
    expect(s.maxSlippage).toBe(SAFETY_LIMITS.MAX_SLIPPAGE);
    expect(s.confirmationRequired).toBe(true);
  });
});

describe('Daily limit', () => {
  it('passes when the order fits into the remaining daily budget', () => {
    const checks = evaluateCopyLimits(limitCtx({ dailyUsed: 90, amount: 10 }));
    expect(checks.find((c) => c.code === 'MAX_DAILY_COPY_VOLUME')?.state).toBe('pass');
  });

  it('fails when the order would exceed the daily maximum', () => {
    const checks = evaluateCopyLimits(limitCtx({ dailyUsed: 95, amount: 10 }));
    expect(checks.find((c) => c.code === 'MAX_DAILY_COPY_VOLUME')?.state).toBe('fail');
    expect(canExecute(checks)).toBe(false);
  });
});

describe('Other safety limits', () => {
  it('rejects whale trades below the minimum size', () => {
    const checks = evaluateCopyLimits(limitCtx({ whaleNotional: 5_000 }));
    expect(failedChecks(checks).map((c) => c.code)).toContain('MIN_WHALE_TRADE_SIZE');
  });

  it('rejects when max open positions is reached', () => {
    const checks = evaluateCopyLimits(limitCtx({ openPositions: 5 }));
    expect(failedChecks(checks).map((c) => c.code)).toContain('MAX_OPEN_POSITIONS');
  });

  it('rejects excessive slippage and marks unknown price as unknown', () => {
    expect(
      failedChecks(evaluateCopyLimits(limitCtx({ currentPrice: 0.7 }))).map((c) => c.code),
    ).toContain('MAX_SLIPPAGE');
    const unknown = evaluateCopyLimits(limitCtx({ currentPrice: null }));
    expect(unknown.find((c) => c.code === 'MAX_SLIPPAGE')?.state).toBe('unknown');
    expect(canExecute(unknown)).toBe(true);
    expect(canExecute(unknown, true)).toBe(false);
  });

  it('rejects insufficient balance', () => {
    const checks = evaluateCopyLimits(limitCtx({ balance: 5 }));
    expect(failedChecks(checks).map((c) => c.code)).toContain('MIN_BALANCE');
  });

  it('rejects SELL, stale trades, excluded markets, closed markets and disallowed categories', () => {
    const codes = failedChecks(
      evaluateCopyLimits(
        limitCtx({
          side: 'SELL',
          tradeTimestamp: 0,
          marketActive: false,
          category: 'Sports',
          settings: { ...base, allowedCategories: ['Crypto'], excludedMarkets: ['btc-120k'] },
        }),
      ),
    ).map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'SIDE_NOT_SUPPORTED',
        'TRADE_TOO_OLD',
        'MARKET_UNAVAILABLE',
        'CATEGORY_NOT_ALLOWED',
        'MARKET_EXCLUDED',
      ]),
    );
  });
});

describe('Copy confirmation', () => {
  it('requires explicit confirmation in manual mode', () => {
    const checks = evaluateCopyLimits(limitCtx({ userConfirmed: false }));
    expect(failedChecks(checks).map((c) => c.code)).toEqual(['CONFIRMATION_REQUIRED']);
    expect(canExecute(checks)).toBe(false);
    // Proposals are still shown to the user.
    expect(canExecute(proposalChecks(checks))).toBe(true);
  });

  it('automatic mode passes only when confirmation was explicitly disabled', () => {
    const auto = { ...base, mode: 'AUTOMATIC' as const, confirmationRequired: false };
    expect(canExecute(evaluateCopyLimits(limitCtx({ userConfirmed: false, settings: auto })))).toBe(
      true,
    );
    const autoWithConfirm = { ...auto, confirmationRequired: true };
    expect(
      canExecute(evaluateCopyLimits(limitCtx({ userConfirmed: false, settings: autoWithConfirm }))),
    ).toBe(false);
  });
});

describe('Duplicate trade prevention (ids)', () => {
  it('derives the same fill id for the same source data', () => {
    const f = {
      transactionHash: '0xAA',
      traderAddress: '0xB',
      tokenId: '1',
      side: 'BUY',
      size: 10,
      price: 0.5,
      timestamp: 1,
    };
    expect(fillId(f)).toBe(fillId({ ...f, transactionHash: '0xaa', traderAddress: '0xb' }));
    expect(fillId(f)).not.toBe(fillId({ ...f, size: 11 }));
  });

  it('builds one idempotency key per user and source trade', () => {
    expect(copyIdempotencyKey('u1', 't1')).toBe(copyIdempotencyKey('u1', 't1'));
    expect(copyIdempotencyKey('u1', 't1')).not.toBe(copyIdempotencyKey('u2', 't1'));
  });

  it('estimates shares from amount and price', () => {
    expect(estimateShares(10, 0.61)).toBeCloseTo(16.3934, 4);
    expect(estimateShares(10, 0)).toBe(0);
  });
});
