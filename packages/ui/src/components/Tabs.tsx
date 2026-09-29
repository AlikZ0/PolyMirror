import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
}

export interface TabsProps<V extends string> {
  items: TabItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  className?: string;
  ariaLabel?: string;
  /** Id prefix used for the tab panels: panel id = `${idBase}-panel-${value}`. */
  idBase?: string;
}

/** WAI-ARIA tab list with arrow-key navigation. Render panels with <TabPanel>. */
export function Tabs<V extends string>({
  items,
  value,
  onValueChange,
  className,
  ariaLabel,
  idBase,
}: TabsProps<V>) {
  const autoId = useId();
  const base = idBase ?? autoId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    const item = items[next];
    if (item) {
      onValueChange(item.value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected
                ? 'border-accent text-fg font-medium'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  children,
  className,
}: {
  idBase: string;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      className={cn('pt-4', className)}
    >
      {children}
    </div>
  );
}
