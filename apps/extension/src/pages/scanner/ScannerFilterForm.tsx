import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@polymirror/ui';
import type { ScannerFilters, TimePeriod } from '@polymirror/shared';

/** Form values as strings; percentages are entered as % and converted to ratios. */
interface Draft {
  minTradeSize: string;
  minTotalVolume: string;
  minTrades: string;
  period: TimePeriod;
  category: string;
  activity: 'active' | 'inactive' | 'any';
  minPnl: string;
  minRoiPct: string;
  minWinRatePct: string;
  minAveragePosition: string;
  maxDrawdown: string;
}

const str = (v: number | undefined, scale = 1) => (v === undefined ? '' : String(+(v * scale).toFixed(6)));
const num = (v: string, scale = 1): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n / scale : undefined;
};

function toDraft(f: ScannerFilters): Draft {
  return {
    minTradeSize: str(f.minTradeSize),
    minTotalVolume: str(f.minTotalVolume),
    minTrades: str(f.minTrades),
    period: f.period,
    category: f.category ?? '',
    activity: f.activity ?? 'any',
    minPnl: str(f.minPnl),
    minRoiPct: str(f.minRoi, 100),
    minWinRatePct: str(f.minWinRate, 100),
    minAveragePosition: str(f.minAveragePosition),
    maxDrawdown: str(f.maxDrawdown),
  };
}

function fromDraft(d: Draft, base: ScannerFilters): ScannerFilters {
  return {
    ...base,
    period: d.period,
    activity: d.activity,
    category: d.category.trim() || undefined,
    minTradeSize: num(d.minTradeSize),
    minTotalVolume: num(d.minTotalVolume),
    minTrades: num(d.minTrades),
    minPnl: num(d.minPnl),
    minRoi: num(d.minRoiPct, 100),
    minWinRate: num(d.minWinRatePct, 100),
    minAveragePosition: num(d.minAveragePosition),
    maxDrawdown: num(d.maxDrawdown),
  };
}

const PERIODS: Array<{ value: TimePeriod; label: string }> = [
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

export function ScannerFilterForm({
  value,
  categories,
  onApply,
  onReset,
  loading,
}: {
  value: ScannerFilters;
  categories: string[];
  onApply: (f: ScannerFilters) => void;
  onReset: () => void;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const id = useId();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(fromDraft(draft, value));
  };

  const numberField = (key: keyof Draft, label: string, hint?: string, step = 'any') => (
    <Field label={label} htmlFor={`${id}-${key}`} hint={hint}>
      <Input
        id={`${id}-${key}`}
        type="number"
        inputMode="decimal"
        step={step}
        value={draft[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder="Any"
      />
    </Field>
  );

  return (
    <form onSubmit={submit} aria-label="Scanner filters" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Period" htmlFor={`${id}-period`}>
          <Select
            id={`${id}-period`}
            value={draft.period}
            onChange={(e) => set('period', e.target.value as TimePeriod)}
            options={PERIODS}
          />
        </Field>
        <Field label="Activity" htmlFor={`${id}-activity`}>
          <Select
            id={`${id}-activity`}
            value={draft.activity}
            onChange={(e) => set('activity', e.target.value as Draft['activity'])}
            options={[
              { value: 'any', label: 'Any' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </Field>
        <Field label="Category" htmlFor={`${id}-category`}>
          <Input
            id={`${id}-category`}
            list={`${id}-categories`}
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Any"
          />
          <datalist id={`${id}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {numberField('minTradeSize', 'Min trade size ($)')}
        {numberField('minTotalVolume', 'Min total volume ($)')}
        {numberField('minTrades', 'Min trades', undefined, '1')}
        {numberField('minPnl', 'Min P/L ($)')}
        {numberField('minRoiPct', 'Min ROI (%)')}
        {numberField('minWinRatePct', 'Min win rate (%)')}
        {numberField('minAveragePosition', 'Min avg position ($)')}
        {numberField('maxDrawdown', 'Max drawdown ($)')}
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          Apply filters
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onReset();
            setDraft(toDraft({ period: '30d', activity: 'any' }));
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}
