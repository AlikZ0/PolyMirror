import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const calloutVariants = cva('flex gap-2 rounded-md border px-3 py-2 text-xs', {
  variants: {
    variant: {
      info: 'border-accent/40 bg-accent/10 text-fg',
      warning: 'border-warning/50 bg-warning/10 text-fg',
      danger: 'border-negative/50 bg-negative/10 text-fg',
      success: 'border-positive/50 bg-positive/10 text-fg',
    },
  },
  defaultVariants: { variant: 'info' },
});

const icons = { info: 'ℹ️', warning: '⚠️', danger: '⛔', success: '✅' } as const;

export interface CalloutProps extends VariantProps<typeof calloutVariants> {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: 'note' | 'alert' | 'status';
}

export function Callout({ variant, title, children, className, role = 'note' }: CalloutProps) {
  return (
    <div role={role} className={cn(calloutVariants({ variant }), className)}>
      <span aria-hidden="true">{icons[variant ?? 'info']}</span>
      <div className="flex flex-col gap-0.5">
        {title ? <strong className="font-semibold">{title}</strong> : null}
        {children ? <div className="text-fg/85">{children}</div> : null}
      </div>
    </div>
  );
}
