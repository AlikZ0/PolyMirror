import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-fg',
        muted: 'border-border bg-transparent text-muted',
        positive: 'border-positive/40 bg-positive/15 text-positive',
        negative: 'border-negative/40 bg-negative/15 text-negative',
        warning: 'border-warning/40 bg-warning/15 text-warning',
        info: 'border-accent/40 bg-accent/15 text-accent',
        demo: 'border-demo bg-demo text-black uppercase tracking-wider shadow-[0_0_12px_var(--color-demo)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
