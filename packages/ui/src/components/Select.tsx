import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
});
