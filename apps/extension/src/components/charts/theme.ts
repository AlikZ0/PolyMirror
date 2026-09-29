/**
 * Chart styling for the dark UI. Categorical slots follow a fixed, CVD-validated order
 * (never cycled); P/L polarity uses the positive/negative tokens and is always backed by
 * signed values in tooltips, so meaning is never carried by color alone.
 */
export const CHART = {
  grid: '#263041',
  axis: '#8b95a7',
  text: '#e6e9ef',
  surface: '#121722',
  accent: '#3987e5',
  positive: '#22c55e',
  negative: '#ef4444',
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: '#1a2130',
    border: '1px solid #263041',
    borderRadius: 8,
    color: CHART.text,
    fontSize: 12,
  },
  labelStyle: { color: CHART.axis },
  itemStyle: { color: CHART.text },
  cursor: { fill: 'rgba(139,149,167,0.12)', stroke: CHART.axis },
} as const;

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export function dayLabel(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function compactUsd(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
