import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  SortableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from '@polymirror/ui';
import type { ScannerSortKey, TraderSummary } from '@polymirror/shared';
import { errorMessage } from '../../components/common/QueryBoundary';
import { Pct, Pnl } from '../../components/common/Values';
import { useWatchlistMutations } from '../../hooks/mutations';
import { formatNumber, formatPct, formatRelativeTime, formatUsd, shortAddress } from '../../utils/format';

const COLUMNS: Array<{ key: ScannerSortKey; label: string }> = [
  { key: 'totalVolume', label: 'Total Volume' },
  { key: 'tradeCount', label: 'Trades' },
  { key: 'averagePosition', label: 'Avg Position' },
  { key: 'pnl', label: 'P/L' },
  { key: 'roi', label: 'ROI' },
  { key: 'winRate', label: 'Win Rate' },
  { key: 'lastActive', label: 'Last Active' },
];

export function ScannerTable({
  items,
  sortBy,
  sortDirection,
  onSort,
}: {
  items: TraderSummary[];
  sortBy: ScannerSortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: ScannerSortKey) => void;
}) {
  const { add } = useWatchlistMutations();
  return (
    <>
    {add.isError ? (
      <p role="alert" className="text-xs text-negative">
        Could not follow trader: {errorMessage(add.error)}
      </p>
    ) : null}
    <Table aria-label="Whale traders">
      <TableHeader>
        <tr>
          <TableHead>Trader</TableHead>
          <TableHead>Address</TableHead>
          {COLUMNS.map((c) => (
            <SortableHead
              key={c.key}
              active={sortBy === c.key}
              direction={sortDirection}
              onSort={() => onSort(c.key)}
              className="text-right"
            >
              {c.label}
            </SortableHead>
          ))}
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {items.map((t) => (
          <TableRow key={t.address} data-testid="scanner-row">
            <TableCell>
              <div className="flex items-center gap-2">
                <Link to={`/traders/${t.address}`} className="font-medium text-accent hover:underline">
                  {t.userName || shortAddress(t.address)}
                </Link>
                {t.active === true ? <Badge variant="positive">Active</Badge> : null}
                {t.active === false ? <Badge variant="muted">Inactive</Badge> : null}
                {!t.enriched ? (
                  <Tooltip content="Only leaderboard data is available for this trader; per-trade metrics show N/A.">
                    <span tabIndex={0} className="cursor-help text-[11px] text-muted italic underline decoration-dotted">
                      partial data
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted" title={t.address}>
              {shortAddress(t.address)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(t.totalVolume, { compact: true })}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(t.tradeCount)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(t.averagePosition, { compact: true })}</TableCell>
            <TableCell className="text-right">
              <Pnl value={t.pnl} compact />
            </TableCell>
            <TableCell className="text-right">
              <Pct value={t.roi} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPct(t.winRate, { decimals: 1 })}</TableCell>
            <TableCell className="text-right text-xs text-muted">{formatRelativeTime(t.lastActive)}</TableCell>
            <TableCell className="text-right">
              {t.isWatched ? (
                <Badge variant="info">Watching</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={add.isPending && add.variables === t.address}
                  onClick={() => add.mutate(t.address)}
                  aria-label={`Follow ${t.userName || t.address}`}
                >
                  Follow
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>
  );
}
