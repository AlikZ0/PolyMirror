import type { ReactNode } from 'react';
import { cn } from '@polymirror/ui';
import { formatPct, formatUsd, signClass } from '../../utils/format';

/** Signed USD value colored green/red; N/A for null. */
export function Pnl({
  value,
  compact,
  className,
}: {
  value: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums', signClass(value), className)}>
      {formatUsd(value, { signed: true, compact })}
    </span>
  );
}

/** Signed percentage colored green/red; N/A for null. */
export function Pct({
  value,
  signed = true,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums', signed ? signClass(value) : 'text-fg', className)}>
      {formatPct(value, { signed })}
    </span>
  );
}

/** Label/value pair for metric grids. */
export function MetricItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-2/60 px-3 py-2">
      <dt className="text-[11px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {children}
    </dl>
  );
}
