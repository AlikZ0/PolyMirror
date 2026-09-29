import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="text-2xl text-muted" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <div className="max-w-md text-xs text-muted">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
