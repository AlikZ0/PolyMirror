import { Badge } from '@polymirror/ui';
import type { CopyDisplayStatus, CopyOrderStatus } from '@polymirror/shared';
import { toDisplayStatus } from '../../utils/format';

const VARIANT: Record<CopyDisplayStatus, 'info' | 'positive' | 'muted' | 'negative' | 'warning'> = {
  Pending: 'info',
  Copied: 'positive',
  Skipped: 'muted',
  Failed: 'negative',
  Cancelled: 'warning',
};

export function CopyStatusBadge({ status }: { status: CopyOrderStatus }) {
  const label = toDisplayStatus(status);
  return (
    <Badge variant={VARIANT[label]} title={status}>
      {label}
    </Badge>
  );
}
