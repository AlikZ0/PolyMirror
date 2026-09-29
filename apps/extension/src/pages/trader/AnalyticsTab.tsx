import type { ReactNode } from 'react';
import { Callout, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@polymirror/ui';
import type { TimePeriod, TraderAnalytics } from '@polymirror/shared';
import { ActiveHoursChart } from '../../components/charts/DistributionCharts';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { MetricGrid, MetricItem, Pct, Pnl } from '../../components/common/Values';
import { useTraderAnalytics } from '../../hooks/queries';
import { formatDuration, formatNumber, formatPct, formatUsd } from '../../utils/format';

export function AnalyticsNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <Callout key={n} variant="info">
          {n}
        </Callout>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AnalyticsView({ a }: { a: TraderAnalytics }) {
  const { performance: p, risk: r, activity: act } = a;
  const markets = [...a.charts.categories]
    .filter((b) => b.count > 0)
    .sort((x, y) => y.volume - x.volume);
  const totalVol = markets.reduce((s, b) => s + b.volume, 0);
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsNotes notes={a.notes} />
      <Section title="Performance">
        <MetricGrid>
          <MetricItem label="Total P/L">
            <Pnl value={p.totalPnl} />
          </MetricItem>
          <MetricItem label="ROI">
            <Pct value={p.roi} />
          </MetricItem>
          <MetricItem label="Win rate">
            {formatPct(p.winRate, { decimals: 1 })}{' '}
            <span className="text-xs font-normal text-muted">
              ({p.wins}W / {p.losses}L)
            </span>
          </MetricItem>
          <MetricItem label="Average P/L">
            <Pnl value={p.averagePnl} />
          </MetricItem>
          <MetricItem label="Median P/L">
            <Pnl value={p.medianPnl} />
          </MetricItem>
          <MetricItem label="Best trade">
            <Pnl value={p.bestTrade} />
          </MetricItem>
          <MetricItem label="Worst trade">
            <Pnl value={p.worstTrade} />
          </MetricItem>
          <MetricItem label="Closed positions">{formatNumber(p.closedPositions)}</MetricItem>
        </MetricGrid>
      </Section>
      <Section title="Risk">
        <MetricGrid>
          <MetricItem label="Max drawdown">
            {formatUsd(r.maxDrawdown)}{' '}
            <span className="text-xs font-normal text-muted">({formatPct(r.maxDrawdownPct)})</span>
          </MetricItem>
          <MetricItem label="Avg position">{formatUsd(r.averagePositionSize)}</MetricItem>
          <MetricItem label="Largest position">{formatUsd(r.largestPosition)}</MetricItem>
          <MetricItem label="Concentration (top market)">
            {formatPct(r.positionConcentration, { decimals: 1 })}
          </MetricItem>
          <MetricItem label="Open positions">{formatNumber(r.openPositions)}</MetricItem>
          <MetricItem label="Max simultaneous positions">
            {formatNumber(r.maxSimultaneousPositions)}
          </MetricItem>
        </MetricGrid>
      </Section>
      <Section title="Activity">
        <div className="flex flex-col gap-4">
          <MetricGrid>
            <MetricItem label="Trades / day">{formatNumber(act.tradesPerDay, 2)}</MetricItem>
            <MetricItem label="Trades / week">{formatNumber(act.tradesPerWeek, 1)}</MetricItem>
            <MetricItem label="Avg holding time">
              {formatDuration(act.averageHoldingTimeMs)}
            </MetricItem>
            <MetricItem label="Total trades">{formatNumber(act.totalTrades)}</MetricItem>
            <MetricItem label="Total volume">{formatUsd(act.totalVolume)}</MetricItem>
            <MetricItem label="Largest fill">{formatUsd(act.largestTrade)}</MetricItem>
          </MetricGrid>
          <ActiveHoursChart hours={act.activeHours} />
        </div>
      </Section>
      <Section title="Market distribution">
        {markets.length === 0 ? (
          <EmptyState
            title="No category data"
            description="Categories are unavailable for this trader's markets."
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Market distribution by category">
            {markets.map((b) => {
              const share = totalVol > 0 ? b.volume / totalVol : null;
              return (
                <li key={b.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span>{b.label}</span>
                    <span className="text-muted tabular-nums">
                      {formatNumber(b.count)} trades · {formatUsd(b.volume, { compact: true })} ·{' '}
                      {formatPct(share, { decimals: 1 })}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-surface-2" aria-hidden="true">
                    <div
                      className="h-1.5 rounded bg-accent"
                      style={{ width: `${Math.round((share ?? 0) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

export function AnalyticsTab({ address, period }: { address: string; period: TimePeriod }) {
  const query = useTraderAnalytics(address, period);
  return <QueryBoundary query={query}>{(a) => <AnalyticsView a={a} />}</QueryBoundary>;
}
