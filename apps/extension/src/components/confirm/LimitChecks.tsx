import type { LimitCheck } from '@polymirror/shared';
import { cn } from '@polymirror/ui';

const ICON: Record<LimitCheck['state'], { symbol: string; className: string; label: string }> = {
  pass: { symbol: '✓', className: 'text-positive', label: 'passed' },
  fail: { symbol: '✕', className: 'text-negative', label: 'failed' },
  unknown: { symbol: '?', className: 'text-warning', label: 'could not be checked' },
};

export function LimitChecks({ checks }: { checks: LimitCheck[] }) {
  if (checks.length === 0) return <p className="text-xs text-muted">No limit checks reported.</p>;
  return (
    <ul className="flex flex-col gap-1" aria-label="Safety limit checks">
      {checks.map((c, i) => {
        const icon = ICON[c.state] ?? ICON.unknown;
        return (
          <li key={`${c.code}-${i}`} className="flex items-start gap-2 text-xs" data-state={c.state}>
            <span
              className={cn('mt-px w-4 shrink-0 text-center font-bold', icon.className)}
              aria-label={icon.label}
              role="img"
            >
              {icon.symbol}
            </span>
            <span className={cn(c.state === 'fail' ? 'text-negative' : 'text-fg/85')}>
              <span className="font-mono text-[10px] text-muted">{c.code}</span> {c.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
