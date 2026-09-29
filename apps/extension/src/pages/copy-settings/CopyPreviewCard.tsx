import { useId, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Field, Input } from '@polymirror/ui';
import { calculateCopyAmount } from '@polymirror/shared';
import { formatAmount, formatUsd } from '../../utils/format';
import { toSettings, type FormState } from './formModel';

/** Live preview: what the user's order would be for a sample whale trade. */
export function CopyPreviewCard({ form }: { form: FormState }) {
  const id = useId();
  const [whale, setWhale] = useState('100000');
  const s = toSettings(form);
  const whaleNotional = Number(whale);
  const valid =
    [s.fixedAmount, s.percentage, s.minCopyAmount, s.maxPerTrade].every(Number.isFinite) &&
    Number.isFinite(whaleNotional);
  const result = valid ? calculateCopyAmount(s, whaleNotional) : null;
  const belowMin = valid && whaleNotional < s.minWhaleTrade;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field label="Sample trader trade ($)" htmlFor={`${id}-whale`}>
          <Input id={`${id}-whale`} type="number" min={0} value={whale} onChange={(e) => setWhale(e.target.value)} />
        </Field>
        <p className="text-sm" data-testid="copy-preview" aria-live="polite">
          Trader <strong>{formatUsd(Number.isFinite(whaleNotional) ? whaleNotional : null)}</strong> → your order{' '}
          <strong className="text-positive">{result ? formatAmount(result.amount) : 'N/A'}</strong>
        </p>
        {result?.clampedBy === 'MAX' ? (
          <p className="text-xs text-muted">Capped by your maximum per trade.</p>
        ) : result?.clampedBy === 'MIN' ? (
          <p className="text-xs text-muted">Raised to your minimum copy amount.</p>
        ) : null}
        {belowMin ? (
          <p className="text-xs text-warning">
            This trade is below your minimum whale trade ({formatUsd(s.minWhaleTrade)}) and would not be proposed.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
