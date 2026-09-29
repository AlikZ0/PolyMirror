import { Card, CardContent, CardHeader, CardTitle, StatCard, toneOf } from '@polymirror/ui';
import { PageHeader } from '../../components/common/PageHeader';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { PendingList } from '../../components/confirm/PendingList';
import { useDashboard } from '../../hooks/queries';
import { formatNumber, formatUsd } from '../../utils/format';
import { RecentEvents } from './RecentEvents';

export function DashboardPage() {
  const query = useDashboard();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description="Your followed whales and copy activity at a glance."
      />
      <QueryBoundary
        query={query}
        skeleton={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => (
              <StatCard key={i} label="…" value="" loading />
            ))}
          </div>
        }
      >
        {(d) => (
          <div className="flex flex-col gap-5">
            <section
              aria-label="Summary"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
            >
              <StatCard label="Tracked traders" value={formatNumber(d.trackedTraders)} />
              <StatCard label="New trades" value={formatNumber(d.newTrades)} />
              <StatCard label="Copied" value={formatNumber(d.copiedTrades)} />
              <StatCard label="Skipped" value={formatNumber(d.skippedTrades)} />
              <StatCard label="Today's copied volume" value={formatUsd(d.todayCopiedVolume)} />
              <StatCard
                label="P/L"
                value={formatUsd(d.pnl, { signed: true })}
                tone={toneOf(d.pnl)}
              />
              <StatCard
                label="Pending confirmations"
                value={formatNumber(d.pendingConfirmations)}
                tone={d.pendingConfirmations > 0 ? 'warning' : 'neutral'}
              />
            </section>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pending confirmations</CardTitle>
                </CardHeader>
                <CardContent>
                  <PendingList />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent events</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecentEvents events={d.recentEvents} />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
