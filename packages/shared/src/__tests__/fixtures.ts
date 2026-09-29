import { DEFAULT_COPY_SETTINGS } from '../constants';
import type { TradeFill, TraderPosition } from '../types';
import type { LimitContext } from '../utils/limits';

let n = 0;
export function fill(p: Partial<TradeFill> & Pick<TradeFill, 'side' | 'size' | 'price' | 'timestamp'>): TradeFill {
  n += 1;
  return {
    id: `f${n}`,
    traderAddress: '0xabc',
    conditionId: 'c1',
    tokenId: 't1',
    marketTitle: 'Will BTC reach $120k?',
    marketSlug: 'btc-120k',
    eventSlug: 'btc-120k',
    outcome: 'Yes',
    outcomeIndex: 0,
    transactionHash: `0x${n}`,
    category: 'Crypto',
    notional: p.size * p.price,
    ...p,
  };
}

export function position(p: Partial<TraderPosition>): TraderPosition {
  n += 1;
  return {
    id: `p${n}`,
    traderAddress: '0xabc',
    conditionId: `c${n}`,
    tokenId: `t${n}`,
    marketTitle: 'm',
    marketSlug: null,
    outcome: 'Yes',
    category: null,
    status: 'CLOSED',
    entryPrice: 0.5,
    exitPrice: 0.6,
    cost: 100,
    pnl: 0,
    realizedPnl: p.pnl ?? 0,
    roi: null,
    openedAt: null,
    closedAt: null,
    ...p,
  };
}

export function limitCtx(overrides: Partial<LimitContext> = {}): LimitContext {
  const now = 1_700_000_000_000;
  return {
    settings: { ...DEFAULT_COPY_SETTINGS },
    amount: 10,
    side: 'BUY',
    whaleNotional: 100_000,
    whalePrice: 0.61,
    currentPrice: 0.61,
    dailyUsed: 0,
    openPositions: 0,
    balance: 1000,
    category: 'Crypto',
    conditionId: 'c1',
    marketSlug: 'btc-120k',
    tradeTimestamp: now - 5_000,
    now,
    maxTradeAgeMs: 180_000,
    marketActive: true,
    userConfirmed: true,
    ...overrides,
  };
}
