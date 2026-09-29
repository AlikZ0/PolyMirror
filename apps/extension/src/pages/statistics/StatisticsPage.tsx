import { StatCard, toneOf } from '@polymirror/ui';
import { AreaSeriesChart } from '../../components/charts/TimeSeriesCharts';
import { PageHeader } from '../../components/common/PageHeader';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { useStatistics } from '../../hooks/queries';
import { formatNumber, formatPct, formatUsd } from '../../utils/format';

export function StatisticsPage() {
  const query = useStatistics();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Statistics" description="Results of your own copied trades." />
      <QueryBoundary query={query}>
        {(s) => (
          <div className="flex flex-col gap-4">
            <section aria-label="Your statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Total copied" value={formatNumber(s.totalCopied)} />
              <StatCard label="Total skipped" value={formatNumber(s.totalSkipped)} />
              <StatCard label="Total volume" value={formatUsd(s.totalVolume)} />
              <StatCard label="Total P/L" value={formatUsd(s.totalPnl, { signed: true })} tone={toneOf(s.totalPnl)} />
              <StatCard label="ROI" value={formatPct(s.roi, { signed: true })} tone={toneOf(s.roi)} />
              <StatCard label="Win rate" value={formatPct(s.winRate, { decimals: 1 })} />
              <StatCard label="Average trade" value={formatUsd(s.averageTrade)} />
              <StatCard label="Best trade" value={formatUsd(s.bestTrade, { signed: true })} tone={toneOf(s.bestTrade)} />
              <StatCard label="Worst trade" value={formatUsd(s.worstTrade, { signed: true })} tone={toneOf(s.worstTrade)} />
              <StatCard label="Max drawdown" value={formatUsd(s.maxDrawdown)} />
            </section>
            <AreaSeriesChart title="Cumulative P/L" seriesName="Cumulative P/L" data={s.cumulativePnl} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
