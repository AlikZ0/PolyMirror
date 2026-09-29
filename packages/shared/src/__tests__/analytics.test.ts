import { describe, expect, it } from 'vitest';
import {
  calculateMaxDrawdown,
  calculatePnl,
  calculateRoi,
  calculateWinRate,
  computeActivity,
  computePerformance,
  computeRisk,
  computeTraderAnalytics,
  maxSimultaneousPositions,
} from '../utils/analytics';
import { reconstructPositions } from '../utils/positions';
import { fill, position } from './fixtures';

const DAY = 86_400_000;

describe('P/L calculation', () => {
  it('computes long P/L from entry, exit and shares', () => {
    expect(calculatePnl(0.4, 0.7, 100)).toBeCloseTo(30);
    expect(calculatePnl(0.6, 0.2, 50)).toBeCloseTo(-20);
    expect(calculatePnl(0.5, 0.5, 10)).toBe(0);
  });

  it('realizes P/L with the average cost method when rebuilding positions', () => {
    const { positions } = reconstructPositions([
      fill({ side: 'BUY', size: 100, price: 0.4, timestamp: 1 }),
      fill({ side: 'BUY', size: 100, price: 0.6, timestamp: 2 }),
      fill({ side: 'SELL', size: 200, price: 0.7, timestamp: 3 }),
    ]);
    expect(positions).toHaveLength(1);
    const p = positions[0]!;
    expect(p.status).toBe('CLOSED');
    expect(p.entryPrice).toBeCloseTo(0.5);
    expect(p.exitPrice).toBeCloseTo(0.7);
    expect(p.cost).toBeCloseTo(100);
    expect(p.pnl).toBeCloseTo(40);
    expect(p.roi).toBeCloseTo(0.4);
    expect(p.closedAt).toBe(3);
  });

  it('settles remaining shares at the resolution price', () => {
    const { positions } = reconstructPositions(
      [fill({ side: 'BUY', size: 100, price: 0.3, timestamp: 1 })],
      {
        resolutions: new Map([['t1', { price: 0, resolvedAt: 10 }]]),
      },
    );
    expect(positions[0]!.status).toBe('RESOLVED');
    expect(positions[0]!.pnl).toBeCloseTo(-30);
    expect(positions[0]!.closedAt).toBe(10);
  });

  it('uses mark prices for unrealized P/L and ignores unmatched sells', () => {
    const { positions, unmatchedSellTokens } = reconstructPositions(
      [
        fill({ side: 'BUY', size: 10, price: 0.5, timestamp: 1 }),
        fill({ side: 'SELL', size: 5, price: 0.6, timestamp: 2 }),
        fill({ side: 'SELL', size: 50, price: 0.6, timestamp: 3, tokenId: 't2' }),
      ],
      { markPrices: new Map([['t1', 0.8]]) },
    );
    expect(positions).toHaveLength(1);
    expect(positions[0]!.status).toBe('OPEN');
    // realized 5*(0.6-0.5)=0.5, unrealized 5*0.8-2.5=1.5
    expect(positions[0]!.pnl).toBeCloseTo(2);
    expect(unmatchedSellTokens).toEqual(['t2']);
  });
});

describe('ROI calculation', () => {
  it('divides P/L by invested capital', () => {
    expect(calculateRoi(25, 100)).toBeCloseTo(0.25);
    expect(calculateRoi(-50, 200)).toBeCloseTo(-0.25);
  });
  it('returns null when nothing was invested', () => {
    expect(calculateRoi(10, 0)).toBeNull();
    expect(calculateRoi(10, Number.NaN)).toBeNull();
  });
});

describe('Win rate', () => {
  it('counts wins over all closed results', () => {
    expect(calculateWinRate([10, -5, 3, 0])).toBeCloseTo(0.5);
  });
  it('is null without closed results', () => {
    expect(calculateWinRate([])).toBeNull();
  });
  it('ignores open positions in performance metrics', () => {
    const perf = computePerformance([
      position({ pnl: 10, status: 'CLOSED' }),
      position({ pnl: -5, status: 'RESOLVED' }),
      position({ pnl: 100, status: 'OPEN' }),
    ]);
    expect(perf.winRate).toBeCloseTo(0.5);
    expect(perf.closedPositions).toBe(2);
    expect(perf.totalPnl).toBeCloseTo(105);
    expect(perf.bestTrade).toBe(10);
    expect(perf.worstTrade).toBe(-5);
    expect(perf.medianPnl).toBeCloseTo(2.5);
    expect(perf.roi).toBeCloseTo(105 / 300);
  });
});

describe('Drawdown', () => {
  it('measures the largest peak-to-trough decline', () => {
    const r = calculateMaxDrawdown([10, 20, -15, -10, 5, 30]);
    // equity 10,30,15,5,10,40 -> peak 30, trough 5 -> 25
    expect(r.maxDrawdown).toBe(25);
    expect(r.series).toEqual([0, 0, -15, -25, -20, 0]);
  });
  it('treats an initial loss as drawdown from zero', () => {
    expect(calculateMaxDrawdown([-10, -5, 20]).maxDrawdown).toBe(15);
  });
  it('is zero for monotonically rising equity and for empty input', () => {
    expect(calculateMaxDrawdown([1, 2, 3]).maxDrawdown).toBe(0);
    expect(calculateMaxDrawdown([]).maxDrawdown).toBe(0);
  });
  it('is N/A in risk metrics when no position has a close time', () => {
    const risk = computeRisk([position({ pnl: -10, closedAt: null })], [], Date.now());
    expect(risk.maxDrawdown).toBeNull();
  });
});

describe('Trader analytics', () => {
  const now = 100 * DAY;
  it('computes activity, concentration and simultaneous positions', () => {
    const fills = [
      fill({ side: 'BUY', size: 100, price: 0.5, timestamp: now - 2 * DAY }),
      fill({
        side: 'BUY',
        size: 100,
        price: 0.5,
        timestamp: now - DAY,
        conditionId: 'c2',
        tokenId: 't2',
      }),
      fill({ side: 'SELL', size: 100, price: 0.8, timestamp: now - DAY / 2 }),
    ];
    const { positions } = reconstructPositions(fills);
    const a = computeTraderAnalytics({ address: '0xABC', period: '7d', fills, positions, now });
    expect(a.address).toBe('0xabc');
    expect(a.activity.totalTrades).toBe(3);
    expect(a.activity.totalVolume).toBeCloseTo(180);
    expect(a.activity.tradesPerDay).toBeCloseTo(3 / 7);
    expect(a.activity.largestTrade).toBeCloseTo(80);
    expect(a.performance.closedPositions).toBe(1);
    expect(a.performance.winRate).toBe(1);
    expect(a.risk.openPositions).toBe(1);
    expect(a.risk.maxSimultaneousPositions).toBe(2);
    expect(a.risk.positionConcentration).toBeCloseTo(130 / 180);
    expect(a.activity.averageHoldingTimeMs).toBeCloseTo(1.5 * DAY);
    expect(a.charts.categories).toEqual([{ label: 'Crypto', count: 3, volume: 180 }]);
    expect(a.charts.cumulativePnl.at(-1)?.value).toBeCloseTo(30);
  });

  it('filters by period', () => {
    const fills = [
      fill({ side: 'BUY', size: 10, price: 0.5, timestamp: now - 40 * DAY }),
      fill({ side: 'BUY', size: 10, price: 0.5, timestamp: now - DAY, tokenId: 't9' }),
    ];
    const { positions } = reconstructPositions(fills);
    const a = computeTraderAnalytics({ address: '0x1', period: '30d', fills, positions, now });
    expect(a.activity.totalTrades).toBe(1);
    expect(a.notes.some((n) => n.includes('No closed positions'))).toBe(true);
  });

  it('activity per day is N/A with no fills and no period', () => {
    const act = computeActivity([], [], 'all', now);
    expect(act.tradesPerDay).toBeNull();
    expect(act.averageHoldingTimeMs).toBeNull();
  });

  it('max simultaneous positions sweeps intervals', () => {
    expect(
      maxSimultaneousPositions(
        [
          position({ openedAt: 0, closedAt: 10 }),
          position({ openedAt: 5, closedAt: 15 }),
          position({ openedAt: 10, closedAt: 20 }),
        ],
        100,
      ),
    ).toBe(2);
    expect(maxSimultaneousPositions([position({ openedAt: null })], 100)).toBeNull();
  });
});
