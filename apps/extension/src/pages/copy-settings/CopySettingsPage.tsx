import { SkeletonRows } from '@polymirror/ui';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { useCopySettings, useSystem } from '../../hooks/queries';
import { CopySettingsForm } from './CopySettingsForm';

export function CopySettingsPage() {
  const query = useCopySettings();
  const system = useSystem();
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={8} />}>
      {(settings) => <CopySettingsForm settings={settings} system={system.data ?? null} />}
    </QueryBoundary>
  );
}
