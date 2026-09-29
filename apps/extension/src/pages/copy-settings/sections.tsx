import { useId, type ReactNode } from 'react';
import { Callout, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, cn } from '@polymirror/ui';
import { SAFETY_LIMITS, type SystemInfo } from '@polymirror/shared';
import { TagInput } from '../../components/common/TagInput';
import { PRESET_CATEGORIES, type FormState, type NumericKey } from './formModel';

export interface SectionProps {
  form: FormState;
  errors: Record<string, string>;
  update: (patch: Partial<FormState>) => void;
  setNumber: (key: NumericKey, v: string) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: ReactNode;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer gap-3 rounded-md border px-3 py-2',
        checked ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2/60',
      )}
    >
      <input id={id} type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 accent-accent" />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function NumberField({
  k,
  label,
  hint,
  form,
  errors,
  setNumber,
  step = 'any',
  min = 0,
  max,
}: SectionProps & { k: NumericKey; label: string; hint?: string; step?: string; min?: number; max?: number }) {
  const id = `cs-${k}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={errors[k]}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={form.numbers[k]}
        invalid={!!errors[k]}
        aria-describedby={errors[k] || hint ? `${id}-desc` : undefined}
        onChange={(e) => setNumber(k, e.target.value)}
      />
    </Field>
  );
}

export function ModeSection({ form, update, system }: SectionProps & { system: SystemInfo | null }) {
  return (
    <Section title="Mode">
      <div role="radiogroup" aria-label="Copy mode" className="flex flex-col gap-2">
        <RadioCard
          name="mode"
          value="MANUAL"
          checked={form.mode === 'MANUAL'}
          onChange={() => update({ mode: 'MANUAL' })}
          title="Manual confirmation (recommended)"
          description="Every copy waits for you to press COPY in the confirmation dialog."
        />
        <RadioCard
          name="mode"
          value="AUTOMATIC"
          checked={form.mode === 'AUTOMATIC'}
          onChange={() => update({ mode: 'AUTOMATIC' })}
          title="Automatic"
          description="Copies are executed without asking — only where the backend supports programmatic execution."
        />
      </div>
      {form.mode === 'AUTOMATIC' ? (
        <Callout variant="warning" title="Automatic mode" role="alert">
          Automatic execution only happens where the backend supports programmatic execution, i.e. the
          demo simulation. In live / assisted mode every order still requires you to place and confirm
          it yourself. All limits below always apply.
          {system ? (
            <div className="mt-1">
              This backend: <strong>{system.mode}</strong> data, <strong>{system.execution}</strong> execution
              {system.supportsProgrammaticExecution ? ' (programmatic execution supported)' : ' (no programmatic execution)'}.
            </div>
          ) : null}
        </Callout>
      ) : null}
    </Section>
  );
}

export function SizingSection(props: SectionProps) {
  const { form, update } = props;
  return (
    <Section title="Sizing">
      <div role="radiogroup" aria-label="Sizing mode" className="grid gap-2 sm:grid-cols-2">
        <RadioCard
          name="sizing"
          value="FIXED"
          checked={form.sizingMode === 'FIXED'}
          onChange={() => update({ sizingMode: 'FIXED' })}
          title="Fixed amount"
          description="Same amount for every copy, regardless of the whale's size."
        />
        <RadioCard
          name="sizing"
          value="PERCENTAGE"
          checked={form.sizingMode === 'PERCENTAGE'}
          onChange={() => update({ sizingMode: 'PERCENTAGE' })}
          title="Percentage of trader trade"
          description="A percentage of the whale's trade, clamped to your min/max."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {form.sizingMode === 'FIXED' ? (
          <NumberField {...props} k="fixedAmount" label="Copy amount ($)" max={SAFETY_LIMITS.MAX_COPY_AMOUNT} />
        ) : (
          <NumberField {...props} k="percentage" label="Percentage (%)" hint="0.01 means 0.01% of the trader's trade" max={100} />
        )}
        <NumberField {...props} k="minCopyAmount" label="Min copy amount ($)" />
      </div>
    </Section>
  );
}

export function LimitsSection(props: SectionProps) {
  return (
    <Section title="Limits">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField {...props} k="maxPerTrade" label="Max per trade ($)" hint={`Hard cap ${SAFETY_LIMITS.MAX_COPY_AMOUNT}`} max={SAFETY_LIMITS.MAX_COPY_AMOUNT} />
        <NumberField {...props} k="maxDailyAmount" label="Max daily amount ($)" hint={`Hard cap ${SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME}`} max={SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME} />
        <NumberField {...props} k="maxOpenPositions" label="Max open copied positions" step="1" max={SAFETY_LIMITS.MAX_OPEN_POSITIONS} />
        <NumberField {...props} k="minWhaleTrade" label="Min whale trade ($)" />
        <NumberField {...props} k="maxSlippagePct" label="Max slippage (%)" hint={`Up to ${SAFETY_LIMITS.MAX_SLIPPAGE * 100}%`} max={SAFETY_LIMITS.MAX_SLIPPAGE * 100} />
        <NumberField {...props} k="minBalance" label="Min balance to keep ($)" />
      </div>
    </Section>
  );
}

export function FiltersSection({ form, errors, update }: SectionProps) {
  const custom = form.allowedCategories.filter(
    (c) => !PRESET_CATEGORIES.some((p) => p.toLowerCase() === c.toLowerCase()),
  );
  const toggle = (cat: string, on: boolean) =>
    update({
      allowedCategories: on
        ? [...form.allowedCategories, cat]
        : form.allowedCategories.filter((c) => c.toLowerCase() !== cat.toLowerCase()),
    });
  return (
    <Section title="Markets">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted">
          Allowed categories <span className="font-normal">(none selected = all categories)</span>
        </legend>
        <div className="flex flex-wrap gap-4">
          {PRESET_CATEGORIES.map((cat) => (
            <Checkbox
              key={cat}
              id={`cs-cat-${cat}`}
              label={cat}
              checked={form.allowedCategories.some((c) => c.toLowerCase() === cat.toLowerCase())}
              onChange={(e) => toggle(cat, e.target.checked)}
            />
          ))}
        </div>
        <TagInput
          id="cs-custom-category"
          value={custom}
          onChange={(next) =>
            update({
              allowedCategories: [
                ...form.allowedCategories.filter((c) => PRESET_CATEGORIES.some((p) => p.toLowerCase() === c.toLowerCase())),
                ...next,
              ],
            })
          }
          placeholder="Add another category…"
          maxLength={64}
        />
        {errors.allowedCategories ? <p className="text-xs text-negative">{errors.allowedCategories}</p> : null}
      </fieldset>
      <Field label="Excluded markets (condition id or slug)" htmlFor="cs-excluded" error={errors.excludedMarkets}>
        <TagInput
          id="cs-excluded"
          value={form.excludedMarkets}
          onChange={(excludedMarkets) => update({ excludedMarkets })}
          placeholder="e.g. will-bitcoin-hit-100k"
        />
      </Field>
    </Section>
  );
}

export function WalletSection({ form, errors, update }: SectionProps) {
  return (
    <Section title="Wallet">
      <Field
        label="Your public Polymarket wallet address (optional)"
        htmlFor="cs-wallet"
        error={errors.walletAddress}
        hint="Used only to verify assisted fills on-chain."
      >
        <Input
          id="cs-wallet"
          value={form.walletAddress}
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          invalid={!!errors.walletAddress}
          aria-describedby="cs-wallet-desc cs-wallet-warning"
          onChange={(e) => update({ walletAddress: e.target.value })}
        />
      </Field>
      <Callout variant="warning" role="note">
        <span id="cs-wallet-warning">
          <strong>Never enter a private key or seed phrase — PolyMirror never asks for them.</strong> Only
          your public 0x address belongs here.
        </span>
      </Callout>
    </Section>
  );
}
