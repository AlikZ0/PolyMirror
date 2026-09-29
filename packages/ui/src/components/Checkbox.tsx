import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, id, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className={cn('h-4 w-4 rounded border-border bg-bg accent-accent', className)}
      {...props}
    />
  );
  if (!label) return input;
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
      {input}
      <span>{label}</span>
    </label>
  );
});
