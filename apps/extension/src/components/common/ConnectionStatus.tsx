import { Button, cn } from '@polymirror/ui';
import { requestReconnect } from '../../hooks/useBackgroundBridge';
import { useNow } from '../../hooks/useTimers';
import { useConnectionStore } from '../../stores/connectionStore';

const LABELS = {
  authenticated: 'Live',
  open: 'Authenticating…',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  closed: 'Offline',
} as const;

/** Small colored dot + label for the realtime connection. */
export function ConnectionDot({ showLabel = true }: { showLabel?: boolean }) {
  const snapshot = useConnectionStore((s) => s.snapshot);
  const available = useConnectionStore((s) => s.bridgeAvailable);
  const state = snapshot?.state ?? 'connecting';
  const color =
    !available ? 'bg-muted' : state === 'authenticated' ? 'bg-positive' : state === 'closed' ? 'bg-negative' : 'bg-warning';
  const label = available ? LABELS[state] : 'No background';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`Realtime: ${label}`}>
      <span className={cn('h-2 w-2 rounded-full', color)} aria-hidden="true" />
      {showLabel ? <span>{label}</span> : <span className="sr-only">Realtime: {label}</span>}
    </span>
  );
}

/** "Connection lost — Retrying…" banner shown whenever the socket is not authenticated. */
export function ConnectionBanner() {
  const snapshot = useConnectionStore((s) => s.snapshot);
  const available = useConnectionStore((s) => s.bridgeAvailable);
  const now = useNow(1_000);
  if (!available || !snapshot || snapshot.state === 'authenticated') return null;
  // Do not flash the banner during the very first connection attempt.
  if (snapshot.state === 'connecting' && snapshot.lastAuthenticatedAt === null && snapshot.attempt === 0) {
    return null;
  }
  const secs =
    snapshot.nextRetryAt !== null ? Math.max(0, Math.ceil((snapshot.nextRetryAt - now) / 1000)) : null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-fg"
    >
      <span>
        <strong className="text-warning">Connection lost — Retrying…</strong>{' '}
        {secs !== null && snapshot.state === 'reconnecting' ? `next attempt in ${secs}s. ` : ''}
        New whale trades may be delayed. Nothing is ever confirmed automatically after reconnecting.
        {snapshot.lastError ? <span className="text-muted"> ({snapshot.lastError})</span> : null}
      </span>
      <Button size="sm" variant="secondary" onClick={requestReconnect}>
        Retry now
      </Button>
    </div>
  );
}
