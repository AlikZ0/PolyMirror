import { EmptyState } from '@polymirror/ui';
import type { NotificationItem, NotificationType } from '@polymirror/shared';
import { formatRelativeTime } from '../../utils/format';

const ICONS: Record<NotificationType, string> = {
  WHALE_TRADE: '🐋',
  COPY_SUCCESS: '📈',
  COPY_SKIPPED: '⏭',
  COPY_FAILED: '⚠️',
  DAILY_LIMIT_REACHED: '🛑',
  TRADER_INACTIVE: '💤',
  CONNECTION_LOST: '📡',
  MARKET_UNAVAILABLE: '🚫',
  INSUFFICIENT_BALANCE: '💸',
};

export function RecentEvents({ events }: { events: NotificationItem[] }) {
  if (events.length === 0) {
    return <EmptyState icon="📭" title="No events yet" description="Follow a trader from the Scanner to start receiving events." />;
  }
  return (
    <ul className="flex flex-col divide-y divide-border/60" aria-label="Recent events">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2">
          <span aria-hidden="true" className="text-lg leading-none">
            {ICONS[e.type] ?? 'ℹ️'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.title}</p>
            <p className="text-xs text-muted">{e.message}</p>
          </div>
          <time className="shrink-0 text-xs text-muted" dateTime={new Date(e.createdAt).toISOString()}>
            {formatRelativeTime(e.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
