import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from '@polymirror/ui';
import { PageHeader } from '../../components/common/PageHeader';
import { errorMessage, QueryBoundary } from '../../components/common/QueryBoundary';
import { TraderLink } from '../../components/common/TraderLink';
import { Pct, Pnl } from '../../components/common/Values';
import { useWatchlistMutations } from '../../hooks/mutations';
import { useWatchlist } from '../../hooks/queries';
import { formatNumber, formatRelativeTime, formatUsd } from '../../utils/format';

export function WatchlistPage() {
  const query = useWatchlist();
  const { remove, setStatus } = useWatchlistMutations();
  const error = remove.error ?? setStatus.error;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Watchlist" description="Traders you follow. Paused traders do not create copy proposals." />
      {error ? (
        <p role="alert" className="text-xs text-negative">
          {errorMessage(error)}
        </p>
      ) : null}
      <Card>
        <CardContent className="pt-4">
          <QueryBoundary
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState
                icon="⭐"
                title="Your watchlist is empty"
                description="Find large traders in the Scanner and follow them."
                action={
                  <Link to="/scanner" className={buttonVariants({ size: 'sm' })}>
                    Open Scanner
                  </Link>
                }
              />
            }
          >
            {(data) => (
              <Table aria-label="Watchlist">
                <TableHeader>
                  <tr>
                    <TableHead>Trader</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last trade</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                    <TableHead className="text-right">New trades</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {data.items.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <TraderLink address={w.traderAddress} name={w.userName} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={w.status === 'ACTIVE' ? 'positive' : 'warning'}>
                          {w.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted">{formatRelativeTime(w.lastTradeAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(w.totalVolume, { compact: true })}</TableCell>
                      <TableCell className="text-right"><Pnl value={w.pnl} compact /></TableCell>
                      <TableCell className="text-right"><Pct value={w.roi} /></TableCell>
                      <TableCell className="text-right">
                        {w.newTrades > 0 ? <Badge variant="info">{formatNumber(w.newTrades)}</Badge> : '0'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link to={`/traders/${w.traderAddress}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                            Open
                          </Link>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={setStatus.isPending && setStatus.variables?.id === w.id}
                            onClick={() => setStatus.mutate({ id: w.id, status: w.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
                          >
                            {w.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-negative"
                            loading={remove.isPending && remove.variables === w.id}
                            onClick={() => remove.mutate(w.id)}
                            aria-label={`Remove ${w.userName || w.traderAddress} from watchlist`}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
