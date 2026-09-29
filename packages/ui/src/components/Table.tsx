import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-border text-xs text-muted', className)} {...props} />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border/60', className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-surface-2/60', className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('px-3 py-2 font-medium whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle whitespace-nowrap', className)} {...props} />;
}

export type SortDirection = 'asc' | 'desc';

export interface SortableHeadProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}

/** Column header button with aria-sort; toggles direction via `onSort`. */
export function SortableHead({
  children,
  active,
  direction,
  onSort,
  className,
  ...props
}: SortableHeadProps) {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2 font-medium whitespace-nowrap', className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          active && 'text-fg',
        )}
      >
        {children}
        <span aria-hidden="true" className="text-[10px]">
          {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
