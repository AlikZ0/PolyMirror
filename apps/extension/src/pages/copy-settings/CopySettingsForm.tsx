import { useState, type FormEvent } from 'react';
import { Button, Callout, Card, CardContent, CardHeader, CardTitle } from '@polymirror/ui';
import type { CopySettings, SystemInfo } from '@polymirror/shared';
import { useSaveCopySettings } from '../../hooks/mutations';
import { isApiError } from '../../services/apiClient';
import { errorMessage } from '../../components/common/QueryBoundary';
import { mapServerErrors, toFormState, validate, type FormState } from './formModel';
import { FiltersSection, LimitsSection, ModeSection, SizingSection, WalletSection } from './sections';
import { CopyPreviewCard } from './CopyPreviewCard';

export function CopySettingsForm({ settings, system }: { settings: CopySettings; system: SystemInfo | null }) {
  const [form, setForm] = useState<FormState>(() => toFormState(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useSaveCopySettings();

  const update = (patch: Partial<FormState>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };
  const setNumber = (key: keyof FormState['numbers'], v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, numbers: { ...f.numbers, [key]: v } }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
    if (!result.ok || !result.value) return;
    save.mutate(result.value, {
      onSuccess: () => setSaved(true),
      onError: (err) => {
        if (isApiError(err) && err.kind === 'validation') setErrors(mapServerErrors(err.fieldErrors));
      },
    });
  };

  const hasErrors = Object.keys(errors).length > 0;
  const sectionProps = { form, errors, update, setNumber };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Copy settings" className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <ModeSection {...sectionProps} system={system} />
        <SizingSection {...sectionProps} />
        <LimitsSection {...sectionProps} />
        <FiltersSection {...sectionProps} />
        <WalletSection {...sectionProps} />
      </div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-32 lg:self-start">
        <CopyPreviewCard form={form} />
        <Card>
          <CardHeader>
            <CardTitle>Save</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {hasErrors ? (
              <Callout variant="danger" role="alert">
                Please fix the highlighted fields.
                {errors.form ? <div>{errors.form}</div> : null}
              </Callout>
            ) : null}
            {save.isError && !(isApiError(save.error) && Object.keys(save.error.fieldErrors).length > 0) ? (
              <Callout variant="danger" role="alert">
                {errorMessage(save.error)}
              </Callout>
            ) : null}
            {saved ? (
              <Callout variant="success" role="status">
                Settings saved. The server applies its safety ceilings on top of these values.
              </Callout>
            ) : null}
            <Button type="submit" loading={save.isPending}>
              Save settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
