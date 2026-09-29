import { DAY_MS, INACTIVE_AFTER_MS, POSITION_SIZE_BUCKETS, TIME_PERIOD_MS } from '../constants';
import type {
  ActivityMetrics,
  DistributionBucket,
  PerformanceMetrics,
  RiskMetrics,
  TimePeriod,
  TimeSeriesPoint,
  TradeFill,
  TraderAnalytics,
  TraderCharts,
  TraderPosition,
  TraderSummary,
} from '../types';
import { dayStartUtc, maxOf, mean, median, minOf, sum } from './math';

// ---------------------------------------------------------------------------
// Primitive metrics (exported individually so they can be tested and reused)
// ---------------------------------------------------------------------------

/** P/L of a position given average entry, exit/mark price and shares. */
export function calculatePnl(entryPrice: number, exitPrice: number, shares: number): number {
  return (exitPrice - entryPrice) * shares;
}

/** Return on investment as a ratio. null when there is no invested capital. */
export function calculateRoi(pnl: number, invested: number): number | null {
  if (!Number.isFinite(invested) || invested <= 0) return null;
  return pnl / invested;
}

/**
 * Win rate over *closed* results: wins / total. Break-even results count as non-wins.
 * null when there are no closed results (a win rate cannot be derived).
 */
export function calculateWinRate(closedPnls: readonly number[]): number | null {
  if (closedPnls.length === 0) return null;
  return closedPnls.filter((p) => p > 0).length / closedPnls.length;
}

export interface DrawdownResult {
  /** Largest peak-to-trough decline of the cumulative P/L curve, as a positive USDC amount. */
  maxDrawdown: number;
  /** Drawdown at each point (<= 0), aligned with the input. */
  series: number[];
  /** Cumulative P/L at each point. */
  equity: number[];
}

/**
 * Maximum drawdown of the cumulative P/L curve built from ordered P/L increments.
 * The curve starts at 0, so an initial loss is a drawdown from the starting point.
 */
export function calculateMaxDrawdown(pnlIncrements: readonly number[]): DrawdownResult {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const series: number[] = [];
  const curve: number[] = [];
  for (const inc of pnlIncrements) {
    equity += inc;
    peak = Math.max(peak, equity);
    const dd = equity - peak;
    maxDd = Math.max(maxDd, -dd);
    series.push(dd);
    curve.push(equity);
  }
  return { maxDrawdown: maxDd, series, equity: curve };
}

export function periodStart(period: TimePeriod, now: number): number | null {
  const len = TIME_PERIOD_MS[period];
  return len === null ? null : now - len;
}

export function filterFillsByPeriod(
  fills: readonly TradeFill[],
  period: TimePeriod,
  now: number,
): TradeFill[] {
  const start = periodStart(period, now);
  return start === null ? [...fills] : fills.filter((f) => f.timestamp >= start);
}

export function filterPositionsByPeriod(
  positions: readonly TraderPosition[],
  period: TimePeriod,
  now: number,
): TraderPosition[] {
  const start = periodStart(period, now);
  if (start === null) return [...positions];
  return positions.filter((p) => {
    // Closed positions belong to the period they were closed in; open ones to their entry time.
    // Positions without any known timestamp cannot be attributed to a period and are excluded.
    const ref = p.status === 'OPEN' ? p.openedAt : (p.closedAt ?? p.openedAt);
    return ref !== null && ref >= start;
  });
}

const closedOf = (positions: readonly TraderPosition[]) =>
  positions.filter((p) => p.status !== 'OPEN');

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export function computePerformance(positions: readonly TraderPosition[]): PerformanceMetrics {
  const closed = closedOf(positions);
  const closedPnls = closed.map((p) => p.pnl);
  const totalCost = sum(positions.map((p) => p.cost));
  const totalPnl = positions.length ? sum(positions.map((p) => p.pnl)) : null;
  return {
    totalPnl,
    realizedPnl: positions.length ? sum(positions.map((p) => p.realizedPnl)) : null,
    roi: totalPnl === null ? null : calculateRoi(totalPnl, totalCost),
    winRate: calculateWinRate(closedPnls),
    averagePnl: mean(closedPnls),
    medianPnl: median(closedPnls),
    bestTrade: maxOf(closedPnls),
    worstTrade: minOf(closedPnls),
    closedPositions: closed.length,
    wins: closedPnls.filter((p) => p > 0).length,
    losses: closedPnls.filter((p) => p < 0).length,
  };
}

function sortedClosedWithTime(positions: readonly TraderPosition[]) {
  return closedOf(positions)
    .filter((p): p is TraderPosition & { closedAt: number } => p.closedAt !== null)
    .sort((a, b) => a.closedAt - b.closedAt);
}

export function maxSimultaneousPositions(
  positions: readonly TraderPosition[],
  now: number,
): number | null {
  const intervals = positions.filter((p) => p.openedAt !== null);
  if (intervals.length === 0) return null;
  const events: Array<[number, number]> = [];
  for (const p of intervals) {
    events.push([p.openedAt!, 1]);
    events.push([p.closedAt ?? now, -1]);
  }
  // Closings before openings at the same instant.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let max = 0;
  for (const [, delta] of events) {
    open += delta;
    max = Math.max(max, open);
  }
  return max;
}

export function computeRisk(
  positions: readonly TraderPosition[],
  fills: readonly TradeFill[],
  now: number,
): RiskMetrics {
  const closed = sortedClosedWithTime(positions);
  const dd = closed.length ? calculateMaxDrawdown(closed.map((p) => p.pnl)) : null;
  const costs = positions.map((p) => p.cost);
  const totalCost = sum(costs);

  const volumeByMarket = new Map<string, number>();
  for (const f of fills) {
    volumeByMarket.set(f.conditionId, (volumeByMarket.get(f.conditionId) ?? 0) + f.notional);
  }
  const totalVolume = sum([...volumeByMarket.values()]);
  const topMarket = maxOf([...volumeByMarket.values()]);

  return {
    maxDrawdown: dd ? dd.maxDrawdown : null,
    maxDrawdownPct: dd && totalCost > 0 ? dd.maxDrawdown / totalCost : null,
    averagePositionSize: mean(costs),
    largestPosition: maxOf(costs),
    positionConcentration: totalVolume > 0 && topMarket !== null ? topMarket / totalVolume : null,
    openPositions: positions.filter((p) => p.status === 'OPEN').length,
    maxSimultaneousPositions: maxSimultaneousPositions(positions, now),
  };
}

export function computeActivity(
  fills: readonly TradeFill[],
  positions: readonly TraderPosition[],
  period: TimePeriod,
  now: number,
): ActivityMetrics {
  const activeHours = new Array<number>(24).fill(0);
  let first: number | null = null;
  let last: number | null = null;
  let largest: number | null = null;
  for (const f of fills) {
    largest = largest === null ? f.notional : Math.max(largest, f.notional);
    activeHours[new Date(f.timestamp).getUTCHours()]! += 1;
    first = first === null ? f.timestamp : Math.min(first, f.timestamp);
    last = last === null ? f.timestamp : Math.max(last, f.timestamp);
  }
  const start = periodStart(period, now) ?? first;
  const days = start === null ? null : Math.max(1, (now - start) / DAY_MS);
  const holding = positions
    .filter((p) => p.openedAt !== null && p.closedAt !== null && p.closedAt >= p.openedAt)
    .map((p) => p.closedAt! - p.openedAt!);

  return {
    totalTrades: fills.length,
    totalVolume: sum(fills.map((f) => f.notional)),
    largestTrade: largest,
    tradesPerDay: days === null ? null : fills.length / days,
    tradesPerWeek: days === null ? null : (fills.length / days) * 7,
    activeHours,
    averageHoldingTimeMs: mean(holding),
    firstTradeAt: first,
    lastTradeAt: last,
  };
}

function dailySeries(entries: Array<{ t: number; v: number }>): TimeSeriesPoint[] {
  const map = new Map<number, number>();
  for (const e of entries) {
    const d = dayStartUtc(e.t);
    map.set(d, (map.get(d) ?? 0) + e.v);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({ t, value }));
}

export function computeCharts(
  positions: readonly TraderPosition[],
  fills: readonly TradeFill[],
): TraderCharts {
  const closed = sortedClosedWithTime(positions);
  const dailyPnl = dailySeries(closed.map((p) => ({ t: p.closedAt, v: p.pnl })));
  const dd = calculateMaxDrawdown(dailyPnl.map((p) => p.value));

  const perf = computePerformance(positions);
  const breakeven = perf.closedPositions - perf.wins - perf.losses;
  const winLoss: DistributionBucket[] = [
    {
      label: 'Wins',
      count: perf.wins,
      volume: sum(closed.filter((p) => p.pnl > 0).map((p) => p.cost)),
    },
    {
      label: 'Losses',
      count: perf.losses,
      volume: sum(closed.filter((p) => p.pnl < 0).map((p) => p.cost)),
    },
  ];
  if (breakeven > 0) {
    winLoss.push({
      label: 'Break-even',
      count: breakeven,
      volume: sum(closed.filter((p) => p.pnl === 0).map((p) => p.cost)),
    });
  }

  const positionSizes: DistributionBucket[] = POSITION_SIZE_BUCKETS.map((b) => ({
    label: b.label,
    count: 0,
    volume: 0,
  }));
  for (const p of positions) {
    const idx = POSITION_SIZE_BUCKETS.findIndex((b) => p.cost < b.max);
    const bucket = positionSizes[idx === -1 ? positionSizes.length - 1 : idx]!;
    bucket.count += 1;
    bucket.volume += p.cost;
  }

  return {
    cumulativePnl: dailyPnl.map((p, i) => ({ t: p.t, value: dd.equity[i]! })),
    dailyPnl,
    dailyVolume: dailySeries(fills.map((f) => ({ t: f.timestamp, v: f.notional }))),
    dailyTrades: dailySeries(fills.map((f) => ({ t: f.timestamp, v: 1 }))),
    drawdown: dailyPnl.map((p, i) => ({ t: p.t, value: dd.series[i]! })),
    winLoss,
    positionSizes,
    categories: categoryDistribution(fills),
  };
}

/** Category distribution based only on categories present in the data. */
export function categoryDistribution(fills: readonly TradeFill[]): DistributionBucket[] {
  const map = new Map<string, DistributionBucket>();
  for (const f of fills) {
    const label = f.category ?? 'Uncategorized';
    const b = map.get(label) ?? { label, count: 0, volume: 0 };
    b.count += 1;
    b.volume += f.notional;
    map.set(label, b);
  }
  return [...map.values()].sort((a, b) => b.volume - a.volume);
}

export function computeTraderAnalytics(input: {
  address: string;
  period: TimePeriod;
  fills: readonly TradeFill[];
  positions: readonly TraderPosition[];
  now?: number;
  notes?: string[];
}): TraderAnalytics {
  const now = input.now ?? Date.now();
  const fills = filterFillsByPeriod(input.fills, input.period, now);
  const positions = filterPositionsByPeriod(input.positions, input.period, now);
  const performance = computePerformance(positions);
  const notes = [...(input.notes ?? [])];

  if (performance.closedPositions === 0) {
    notes.push(
      'No closed positions in this period: win rate, average/median P/L and drawdown are N/A.',
    );
  }
  if (positions.some((p) => p.openedAt === null)) {
    notes.push(
      'Some positions have no known entry time; holding time uses only positions with both entry and exit times.',
    );
  }
  if (fills.some((f) => f.category === null)) {
    notes.push(
      'Some markets have no category in the source data and are shown as "Uncategorized".',
    );
  }

  return {
    address: input.address.toLowerCase(),
    period: input.period,
    performance,
    risk: computeRisk(positions, fills, now),
    activity: computeActivity(fills, positions, input.period, now),
    charts: computeCharts(positions, fills),
    notes,
    computedAt: now,
  };
}

/** Condensed scanner row from analytics. */
export function summarizeTrader(
  base: Pick<TraderSummary, 'address' | 'userName' | 'profileImage'>,
  analytics: TraderAnalytics,
  now: number,
  isWatched: boolean,
): TraderSummary {
  const last = analytics.activity.lastTradeAt;
  return {
    ...base,
    totalVolume: analytics.activity.totalVolume,
    tradeCount: analytics.activity.totalTrades,
    averagePosition: analytics.risk.averagePositionSize,
    largestTrade: analytics.activity.largestTrade,
    pnl: analytics.performance.totalPnl,
    roi: analytics.performance.roi,
    winRate: analytics.performance.winRate,
    maxDrawdown: analytics.risk.maxDrawdown,
    lastActive: last,
    categories: analytics.charts.categories
      .map((c) => c.label)
      .filter((l) => l !== 'Uncategorized'),
    active: last === null ? false : now - last <= INACTIVE_AFTER_MS,
    enriched: true,
    isWatched,
  };
}
