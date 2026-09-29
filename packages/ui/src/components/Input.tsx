import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
        invalid && 'border-negative focus-visible:ring-negative',
        className,
      )}
      {...props}
    />
  );
});
