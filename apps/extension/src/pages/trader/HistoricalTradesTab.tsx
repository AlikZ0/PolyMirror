import { useId, useState } from 'react';
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  SortableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@polymirror/ui';
import type { HistoricalTradesQuery, PositionStatus } from '@polymirror/shared';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { Pct, Pnl } from '../../components/common/Values';
import { useTraderTrades } from '../../hooks/queries';
import { useDebouncedValue } from '../../hooks/useTimers';
import { formatDateTime, formatPrice, formatUsd } from '../../utils/format';

type SortKey = NonNullable<HistoricalTradesQuery['sortBy']>;
const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<PositionStatus, 'info' | 'muted' | 'default'> = {
  OPEN: 'info',
  CLOSED: 'muted',
  RESOLVED: 'default',
};

/** Parses a yyyy-mm-dd input as a UTC day start (or end) in epoch ms. */
function dayToMs(v: string, endOfDay = false): number | undefined {
  if (!v) return undefined;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t)) return undefined;
  return endOfDay ? t + 86_400_000 - 1 : t;
}

export function HistoricalTradesTab({ address }: { address: string }) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [status, setStatus] = useState<PositionStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const query = useTraderTrades(address, {
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDirection,
    status,
    search: debouncedSearch || undefined,
    from: dayToMs(from),
    to: dayToMs(to, true),
  });

  const sort = (key: SortKey) => {
    setPage(1);
    if (sortBy === key) setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(key);
      setSortDirection('desc');
    }
  };
  const head = (key: SortKey, label: string, right = false) => (
    <SortableHead
      active={sortBy === key}
      direction={sortDirection}
      onSort={() => sort(key)}
      className={right ? 'text-right' : undefined}
    >
      {label}
    </SortableHead>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Search market" htmlFor={`${id}-search`}>
          <Input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="e.g. election"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Status" htmlFor={`${id}-status`}>
          <Select
            id={`${id}-status`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PositionStatus | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'OPEN', label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
              { value: 'RESOLVED', label: 'Resolved' },
            ]}
          />
        </Field>
        <Field label="From" htmlFor={`${id}-from`}>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="To" htmlFor={`${id}-to`}>
          <Input
            id={`${id}-to`}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState
            icon="📄"
            title="No trades found"
            description="Adjust the search, status or date range."
          />
        }
      >
        {(data) => (
          <div className="flex flex-col gap-3" aria-busy={query.isFetching}>
            <Table aria-label="Historical trades">
              <TableHeader>
                <tr>
                  {head('date', 'Date')}
                  {head('market', 'Market')}
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  {head('positionSize', 'Position size', true)}
                  {head('pnl', 'P/L', true)}
                  {head('roi', 'ROI', true)}
                  <TableHead>Status</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted">{formatDateTime(r.date)}</TableCell>
                    <TableCell className="max-w-72 truncate" title={r.market ?? undefined}>
                      {r.market ?? 'N/A'}
                      {r.outcome ? (
                        <span className="ml-1 text-xs text-muted">· {r.outcome}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.side === 'BUY' ? 'positive' : r.side === 'SELL' ? 'negative' : 'muted'
                        }
                      >
                        {r.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(r.entry)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(r.exit)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(r.positionSize)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Pnl value={r.pnl} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={r.roi} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
              disabled={query.isFetching}
            />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
