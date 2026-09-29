import { Button, StatCard, toneOf } from '@polymirror/ui';
import { ConnectionBanner, ConnectionDot } from '../components/common/ConnectionStatus';
import { DemoBadge } from '../components/common/DemoBadge';
import { errorMessage } from '../components/common/QueryBoundary';
import { PendingList } from '../components/confirm/PendingList';
import { useDashboard } from '../hooks/queries';
import { openDashboard } from '../utils/chromeApi';
import { formatNumber, formatUsdShort } from '../utils/format';

export function PopupApp() {
  const dashboard = useDashboard();
  const d = dashboard.data;
  return (
    <div className="flex min-h-[480px] flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="font-bold">
          <span aria-hidden="true">🐋 </span>PolyMirror
        </span>
        <ConnectionDot />
      </header>
      <div className="px-3 pt-2">
        <DemoBadge />
      </div>
      <ConnectionBanner />
      <main className="flex flex-1 flex-col gap-3 px-3 py-3">
        <section aria-label="Quick stats" className="grid grid-cols-3 gap-2">
          <StatCard
            label="Pending"
            value={d ? formatNumber(d.pendingConfirmations) : '—'}
            loading={dashboard.isPending}
            tone={d && d.pendingConfirmations > 0 ? 'warning' : 'neutral'}
            className="px-2 py-2"
          />
          <StatCard
            label="Today"
            value={d ? formatUsdShort(d.todayCopiedVolume) : '—'}
            loading={dashboard.isPending}
            className="px-2 py-2"
          />
          <StatCard
            label="P/L"
            value={d ? formatUsdShort(d.pnl, true) : '—'}
            tone={toneOf(d?.pnl)}
            loading={dashboard.isPending}
            className="px-2 py-2"
          />
        </section>
        {dashboard.isError ? (
          <p role="alert" className="text-xs text-negative">
            {errorMessage(dashboard.error)}{' '}
            <button
              type="button"
              className="cursor-pointer underline"
              onClick={() => void dashboard.refetch()}
            >
              Retry
            </button>
          </p>
        ) : null}
        <section aria-label="Pending confirmations" className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Pending confirmations
          </h2>
          <PendingList compact limit={5} />
        </section>
      </main>
      <footer className="border-t border-border px-3 py-2">
        <Button className="w-full" onClick={() => void openDashboard('/')}>
          Open dashboard
        </Button>
      </footer>
    </div>
  );
}
