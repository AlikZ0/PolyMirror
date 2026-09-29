import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '@polymirror/shared';
import { formatNumber, formatUsd } from '../../utils/format';
import { CHART, axisProps, compactUsd, dayLabel, tooltipStyle } from './theme';
import { ChartCard } from './ChartCard';

type ValueKind = 'usd' | 'count';

const fmt = (kind: ValueKind) => (v: number) =>
  kind === 'usd' ? formatUsd(v, { signed: false }) : formatNumber(v);

export function AreaSeriesChart({
  title,
  data,
  color = CHART.accent,
  kind = 'usd',
  seriesName,
}: {
  title: string;
  data: TimeSeriesPoint[];
  color?: string;
  kind?: ValueKind;
  seriesName: string;
}) {
  const gradientId = `grad-${title.replace(/\W+/g, '')}`;
  return (
    <ChartCard title={title} empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={dayLabel} {...axisProps} minTickGap={24} />
          <YAxis
            tickFormatter={kind === 'usd' ? compactUsd : undefined}
            width={56}
            {...axisProps}
          />
          <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.5} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(t) => dayLabel(Number(t))}
            formatter={(v) => [fmt(kind)(Number(v)), seriesName]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function BarSeriesChart({
  title,
  data,
  kind = 'usd',
  seriesName,
  signed = false,
}: {
  title: string;
  data: TimeSeriesPoint[];
  kind?: ValueKind;
  seriesName: string;
  /** Color bars green/red by sign (daily P/L). */
  signed?: boolean;
}) {
  return (
    <ChartCard title={title} empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={dayLabel} {...axisProps} minTickGap={24} />
          <YAxis
            tickFormatter={kind === 'usd' ? compactUsd : undefined}
            width={56}
            allowDecimals={kind === 'usd'}
            {...axisProps}
          />
          {signed ? <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.5} /> : null}
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(t) => dayLabel(Number(t))}
            formatter={(v) => [
              kind === 'usd' ? formatUsd(Number(v), { signed }) : formatNumber(Number(v)),
              seriesName,
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28} fill={CHART.accent}>
            {signed
              ? data.map((p) => (
                  <Cell key={p.t} fill={p.value >= 0 ? CHART.positive : CHART.negative} />
                ))
              : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
