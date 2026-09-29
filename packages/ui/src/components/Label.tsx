import type { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-muted', className)} {...props} />;
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired with aria-describedby by the caller via `${htmlFor}-desc`. */
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-desc`} role="alert" className="text-xs text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-desc`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
