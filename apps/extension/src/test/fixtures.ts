import type { CopyOrder, CopyPreview, LimitCheck } from '@polymirror/shared';

export const WHALE = '0x1111111111111111111111111111111111111111';

export const passingChecks: LimitCheck[] = [
  { code: 'MAX_COPY_AMOUNT', passed: true, state: 'pass', message: '$10 ≤ max per trade $20' },
  { code: 'MAX_DAILY_COPY_VOLUME', passed: true, state: 'pass', message: '$10 of $100 daily limit' },
  { code: 'MIN_BALANCE', passed: true, state: 'unknown', message: 'Balance cannot be checked in assisted mode' },
];

export function makeOrder(overrides: Partial<CopyOrder> = {}): CopyOrder {
  const now = Date.now();
  return {
    id: 'order-1',
    userId: 'user-1',
    traderAddress: WHALE,
    sourceTradeId: 'trade-1',
    conditionId: '0xcond',
    tokenId: 'token-1',
    marketTitle: 'Will BTC close above $100k on Friday?',
    marketUrl: 'https://polymarket.com/event/btc-100k',
    outcome: 'Yes',
    side: 'BUY',
    whaleSize: 100_000,
    whalePrice: 0.62,
    amount: 10,
    estimatedShares: 16.129,
    status: 'PENDING',
    execution: 'demo',
    failureReason: null,
    externalOrderId: null,
    transactionHash: null,
    fillPrice: null,
    filledShares: null,
    currentPrice: 0.63,
    pnl: null,
    closedAt: null,
    createdAt: now - 10_000,
    executedAt: null,
    expiresAt: now + 170_000,
    ...overrides,
  };
}

export function makePreview(overrides: Partial<CopyPreview> = {}): CopyPreview {
  const now = Date.now();
  return {
    copyOrderId: 'order-1',
    sourceTradeId: 'trade-1',
    traderAddress: WHALE,
    marketTitle: 'Will BTC close above $100k on Friday?',
    marketUrl: 'https://polymarket.com/event/btc-100k',
    outcome: 'Yes',
    side: 'BUY',
    whaleSize: 100_000,
    whalePrice: 0.62,
    currentPrice: 0.63,
    amount: 10,
    estimatedShares: 16.129,
    checks: passingChecks,
    allowed: true,
    execution: 'demo',
    dailyUsed: 0,
    dailyRemaining: 100,
    openPositions: 0,
    expiresAt: now + 170_000,
    ...overrides,
  };
}
