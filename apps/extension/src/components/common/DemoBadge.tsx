import { Badge } from '@polymirror/ui';
import { useSystem } from '../../hooks/queries';

/** Unmissable DEMO MODE marker, shown whenever the backend runs in demo mode. */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const { data } = useSystem();
  if (data?.mode !== 'demo') return null;
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <Badge variant="demo" data-testid="demo-badge">
        DEMO MODE
      </Badge>
      {compact ? null : (
        <span className="text-xs font-medium text-demo">no real trades are executed</span>
      )}
    </div>
  );
}
