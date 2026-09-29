import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying,
  retryLabel = 'Retry',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-negative/40 bg-negative/10 px-4 py-6 text-center',
        className,
      )}
    >
      <p className="text-sm font-semibold text-negative">{title}</p>
      <div className="max-w-md text-xs text-fg/80">{message}</div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} className="mt-1">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
