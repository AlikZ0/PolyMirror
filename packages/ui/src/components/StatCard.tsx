import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'positive' | 'negative' | 'neutral' | 'warning';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Secondary text shown under the value (e.g. "+12% vs yesterday"). */
  delta?: ReactNode;
  /** Colors the value/delta. Use `toneOf(number)` for signed values. */
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  loading?: boolean;
}

const toneClass: Record<Tone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
  neutral: 'text-fg',
};

/** Tone for a signed number: >0 positive, <0 negative, otherwise neutral (null → neutral). */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return 'neutral';
  }
  return value > 0 ? 'positive' : 'negative';
}

export function StatCard({ label, value, delta, tone = 'neutral', icon, className, loading }: StatCardProps) {
  return (
    <div
      className={cn('flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-3', className)}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      {loading ? (
        <div className="h-6 w-20 animate-pulse rounded bg-surface-2" aria-hidden="true" />
      ) : (
        <div className={cn('text-lg font-semibold tabular-nums', toneClass[tone])}>{value}</div>
      )}
      {delta ? <div className={cn('text-xs', toneClass[tone])}>{delta}</div> : null}
    </div>
  );
}
