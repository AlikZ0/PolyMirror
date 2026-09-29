import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  className,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      {label ? (
        <label htmlFor={switchId} className="flex flex-col text-sm text-fg">
          <span>{label}</span>
          {description ? <span className="text-xs text-muted">{description}</span> : null}
        </label>
      ) : null}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-surface-2',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
