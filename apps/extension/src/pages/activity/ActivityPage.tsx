import { useId, useState } from 'react';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Field,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@polymirror/ui';
import type { CopyOrderStatus } from '@polymirror/shared';
import { PageHeader } from '../../components/common/PageHeader';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { CopyStatusBadge } from '../../components/common/StatusBadge';
import { TraderLink } from '../../components/common/TraderLink';
import { Pnl } from '../../components/common/Values';
import { useHistory } from '../../hooks/queries';
import { formatDateTime, formatPrice, formatUsd } from '../../utils/format';

const PAGE_SIZE = 25;

/** Display filter → backend statuses (Pending covers PENDING/EXECUTING/SUBMITTED). */
const STATUS_OPTIONS: Array<{ value: CopyOrderStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUBMITTED', label: 'Pending (awaiting fill)' },
  { value: 'CONFIRMED', label: 'Copied' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function ActivityPage() {
  const id = useId();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CopyOrderStatus | 'ALL'>('ALL');
  const query = useHistory({ page, pageSize: PAGE_SIZE, status });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Activity" description="Every copy proposal and what happened to it." />
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Field label="Status" htmlFor={`${id}-status`} className="w-56">
            <Select
              id={`${id}-status`}
              value={status}
              options={STATUS_OPTIONS}
              onChange={(e) => {
                setStatus(e.target.value as CopyOrderStatus | 'ALL');
                setPage(1);
              }}
            />
          </Field>
          <QueryBoundary
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState icon="🗂" title="No copy activity yet" />}
          >
            {(data) => (
              <div className="flex flex-col gap-3">
                <Table aria-label="Copy history">
                  <TableHeader>
                    <tr>
                      <TableHead>Time</TableHead>
                      <TableHead>Trader</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">Whale Size</TableHead>
                      <TableHead className="text-right">Your Size</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs text-muted">
                          {formatDateTime(o.createdAt)}
                        </TableCell>
                        <TableCell>
                          <TraderLink address={o.traderAddress} />
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal">
                          <span className="line-clamp-2">{o.marketTitle ?? 'N/A'}</span>
                          {o.status === 'FAILED' && o.failureReason ? (
                            <span className="block text-xs text-negative">
                              Reason: {o.failureReason}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsd(o.whaleSize, { compact: true })}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatUsd(o.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.side === 'BUY' ? 'positive' : 'negative'}>
                            {o.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPrice(o.fillPrice ?? o.whalePrice)}
                        </TableCell>
                        <TableCell>
                          <CopyStatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Pnl value={o.pnl} />
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
        </CardContent>
      </Card>
    </div>
  );
}
