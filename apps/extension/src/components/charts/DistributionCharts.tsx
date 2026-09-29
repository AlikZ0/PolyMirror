import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DistributionBucket } from '@polymirror/shared';
import { formatNumber, formatUsd } from '../../utils/format';
import { CHART, axisProps, tooltipStyle } from './theme';
import { ChartCard } from './ChartCard';

/** Folds buckets beyond the 8 categorical slots into "Other" (hues are never generated/cycled). */
function foldBuckets(buckets: DistributionBucket[], max = CHART.categorical.length): DistributionBucket[] {
  const nonEmpty = buckets.filter((b) => b.count > 0);
  if (nonEmpty.length <= max) return nonEmpty;
  const sorted = [...nonEmpty].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  return [
    ...head,
    {
      label: 'Other',
      count: rest.reduce((s, b) => s + b.count, 0),
      volume: rest.reduce((s, b) => s + b.volume, 0),
    },
  ];
}

export function DistributionPie({ title, data }: { title: string; data: DistributionBucket[] }) {
  // Only categories present in the data are shown.
  const buckets = foldBuckets(data);
  return (
    <ChartCard title={title} empty={buckets.length === 0} height={240}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, entry) => {
              const b = (entry as { payload?: DistributionBucket }).payload;
              return [`${formatNumber(Number(v))} trades · ${formatUsd(b?.volume ?? null, { compact: true })}`, b?.label ?? ''];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: CHART.axis }} />
          <Pie
            data={buckets}
            dataKey="count"
            nameKey="label"
            innerRadius="45%"
            outerRadius="75%"
            paddingAngle={1}
            stroke={CHART.surface}
            strokeWidth={2}
          >
            {buckets.map((b, i) => (
              <Cell key={b.label} fill={CHART.categorical[i % CHART.categorical.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DistributionBars({
  title,
  data,
  colorFor,
}: {
  title: string;
  data: DistributionBucket[];
  colorFor?: (bucket: DistributionBucket) => string;
}) {
  const empty = data.every((b) => b.count === 0);
  return (
    <ChartCard title={title} empty={data.length === 0 || empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={0} />
          <YAxis allowDecimals={false} width={40} {...axisProps} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, entry) => {
              const b = (entry as { payload?: DistributionBucket }).payload;
              return [`${formatNumber(Number(v))} · ${formatUsd(b?.volume ?? null, { compact: true })} volume`, 'Trades'];
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48} fill={CHART.accent}>
            {colorFor ? data.map((b) => <Cell key={b.label} fill={colorFor(b)} />) : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 24 bars, UTC hour of day → number of fills. */
export function ActiveHoursChart({ hours }: { hours: number[] }) {
  const data = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}`, count: hours[h] ?? 0 }));
  const empty = data.every((d) => d.count === 0);
  return (
    <ChartCard title="Active hours (UTC)" empty={empty} height={180}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" {...axisProps} interval={2} />
          <YAxis allowDecimals={false} width={32} {...axisProps} />
          <Tooltip {...tooltipStyle} labelFormatter={(h) => `${h}:00 UTC`} formatter={(v) => [formatNumber(Number(v)), 'Fills']} />
          <Bar dataKey="count" fill={CHART.accent} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
