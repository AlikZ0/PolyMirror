import { useState } from 'react';
import { Card, CardContent, EmptyState } from '@polymirror/ui';
import type { ScannerFilters, ScannerSortKey } from '@polymirror/shared';
import { PageHeader } from '../../components/common/PageHeader';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { useTraders } from '../../hooks/queries';
import { formatDateTime } from '../../utils/format';
import { ScannerFilterForm } from './ScannerFilterForm';
import { ScannerTable } from './ScannerTable';

export const DEFAULT_FILTERS: ScannerFilters = {
  period: '30d',
  activity: 'any',
  sortBy: 'totalVolume',
  sortDirection: 'desc',
  limit: 50,
};

export function ScannerPage() {
  const [filters, setFilters] = useState<ScannerFilters>(DEFAULT_FILTERS);
  const query = useTraders(filters);

  const onSort = (key: ScannerSortKey) =>
    setFilters((f) => ({
      ...f,
      sortBy: key,
      sortDirection: f.sortBy === key && f.sortDirection === 'desc' ? 'asc' : 'desc',
    }));

  const categories = Array.from(
    new Set((query.data?.items ?? []).flatMap((t) => t.categories)),
  ).sort();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Whale Scanner"
        description="Large Polymarket traders ranked by real, observable metrics. No composite scores."
      />
      <Card>
        <CardContent className="pt-4">
          <ScannerFilterForm
            value={filters}
            categories={categories}
            onApply={(f) =>
              setFilters((prev) => ({
                ...f,
                sortBy: prev.sortBy,
                sortDirection: prev.sortDirection,
              }))
            }
            onReset={() => setFilters(DEFAULT_FILTERS)}
            loading={query.isFetching}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <QueryBoundary
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState
                icon="🔍"
                title="No traders match these filters"
                description="Try a longer period or lower minimums."
              />
            }
          >
            {(data) => (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">
                  {data.items.length} traders · source: {data.source} · updated{' '}
                  {formatDateTime(data.generatedAt)}
                </p>
                <ScannerTable
                  items={data.items}
                  sortBy={filters.sortBy ?? 'totalVolume'}
                  sortDirection={filters.sortDirection ?? 'desc'}
                  onSort={onSort}
                />
              </div>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
