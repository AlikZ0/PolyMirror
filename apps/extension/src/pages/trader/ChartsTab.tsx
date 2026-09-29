import type { DistributionBucket, TimePeriod } from '@polymirror/shared';
import { DistributionBars, DistributionPie } from '../../components/charts/DistributionCharts';
import { CHART } from '../../components/charts/theme';
import { AreaSeriesChart, BarSeriesChart } from '../../components/charts/TimeSeriesCharts';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { useTraderAnalytics } from '../../hooks/queries';
import { AnalyticsNotes } from './AnalyticsTab';

const winLossColor = (b: DistributionBucket) =>
  /win/i.test(b.label) ? CHART.positive : /loss/i.test(b.label) ? CHART.negative : CHART.accent;

export function ChartsTab({ address, period }: { address: string; period: TimePeriod }) {
  const query = useTraderAnalytics(address, period);
  return (
    <QueryBoundary query={query}>
      {(a) => (
        <div className="flex flex-col gap-4">
          <AnalyticsNotes notes={a.notes} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AreaSeriesChart title="Cumulative P/L" seriesName="Cumulative P/L" data={a.charts.cumulativePnl} />
            <BarSeriesChart title="Daily P/L" seriesName="P/L" data={a.charts.dailyPnl} signed />
            <BarSeriesChart title="Trade volume" seriesName="Volume" data={a.charts.dailyVolume} />
            <BarSeriesChart title="Number of trades" seriesName="Trades" data={a.charts.dailyTrades} kind="count" />
            <DistributionBars title="Win / Loss distribution" data={a.charts.winLoss} colorFor={winLossColor} />
            <DistributionBars title="Position size distribution" data={a.charts.positionSizes} />
            <DistributionPie title="Category distribution" data={a.charts.categories} />
            <AreaSeriesChart title="Drawdown" seriesName="Drawdown" data={a.charts.drawdown} color={CHART.negative} />
          </div>
        </div>
      )}
    </QueryBoundary>
  );
}
