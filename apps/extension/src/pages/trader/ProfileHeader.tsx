import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardContent, buttonVariants } from '@polymirror/ui';
import type { TraderProfile } from '@polymirror/shared';
import { MetricGrid, MetricItem, Pct, Pnl } from '../../components/common/Values';
import { errorMessage } from '../../components/common/QueryBoundary';
import { useWatchlistMutations } from '../../hooks/mutations';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPct,
  formatRelativeTime,
  formatUsd,
  shortAddress,
} from '../../utils/format';

export function ProfileHeader({ profile: p }: { profile: TraderProfile }) {
  const { add, remove } = useWatchlistMutations();
  const busy = add.isPending || remove.isPending;
  const error = add.error ?? remove.error;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {p.profileImage ? (
              <img
                src={p.profileImage}
                alt=""
                className="h-10 w-10 rounded-full border border-border object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-lg"
              >
                🐋
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold" data-testid="trader-title">
                {p.userName || shortAddress(p.address)}
              </h1>
              <p className="font-mono text-xs break-all text-muted">{p.address}</p>
            </div>
            {p.isWatched ? <Badge variant="info">Following</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.isWatched && p.watchlistId ? (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => remove.mutate(p.watchlistId!)}
              >
                Unfollow
              </Button>
            ) : (
              <Button loading={busy} onClick={() => add.mutate(p.address)}>
                Follow
              </Button>
            )}
            <Link to={`/compare/${p.address}`} className={buttonVariants({ variant: 'outline' })}>
              Compare with me
            </Link>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-negative">
            {errorMessage(error)}
          </p>
        ) : null}
        <MetricGrid className="lg:grid-cols-6">
          <MetricItem label="Total volume">{formatUsd(p.totalVolume)}</MetricItem>
          <MetricItem label="Trades">{formatNumber(p.tradeCount)}</MetricItem>
          <MetricItem label="Avg position">{formatUsd(p.averagePosition)}</MetricItem>
          <MetricItem label="Largest position">{formatUsd(p.largestPosition)}</MetricItem>
          <MetricItem label="P/L">
            <Pnl value={p.pnl} />
          </MetricItem>
          <MetricItem label="ROI">
            <Pct value={p.roi} />
          </MetricItem>
          <MetricItem label="Win rate">{formatPct(p.winRate, { decimals: 1 })}</MetricItem>
          <MetricItem label="Avg holding time">{formatDuration(p.averageHoldingTimeMs)}</MetricItem>
          <MetricItem label="Max drawdown">{formatUsd(p.maxDrawdown)}</MetricItem>
          <MetricItem label="Last active">
            <span title={formatDateTime(p.lastActive)}>{formatRelativeTime(p.lastActive)}</span>
          </MetricItem>
          <MetricItem label="Markets traded">{formatNumber(p.marketsTraded)}</MetricItem>
          <MetricItem label="Categories">
            {p.categories.length === 0 ? (
              'N/A'
            ) : (
              <span className="flex flex-wrap gap-1">
                {p.categories.map((c) => (
                  <Badge key={c} variant="muted">
                    {c}
                  </Badge>
                ))}
              </span>
            )}
          </MetricItem>
        </MetricGrid>
      </CardContent>
    </Card>
  );
}
