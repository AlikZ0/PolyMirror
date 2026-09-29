import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button, EmptyState } from '@polymirror/ui';
import { useInvalidateCopyState } from '../../hooks/mutations';
import { usePending } from '../../hooks/queries';
import { api } from '../../services/api';
import { formatAmount, formatRelativeTime, formatUsd, shortAddress } from '../../utils/format';
import { errorMessage, QueryBoundary } from '../common/QueryBoundary';
import { ConfirmationModal, type PendingItem } from './ConfirmationModal';

/**
 * Pending confirmations with COPY / SKIP. COPY opens the confirmation modal — it never executes
 * from the list directly, so the user always sees every limit check first. SKIP is non-financial.
 */
export function PendingList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const query = usePending();
  const [selected, setSelected] = useState<PendingItem | null>(null);
  const invalidate = useInvalidateCopyState();
  const skip = useMutation({
    mutationFn: (copyOrderId: string) => api.skip({ copyOrderId }),
    onSettled: invalidate,
  });

  return (
    <>
      <QueryBoundary
        query={query}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState
            icon="🐋"
            title="No pending confirmations"
            description="When a followed trader opens a position you will be asked to confirm your copy here."
          />
        }
      >
        {(data) => (
          <>
          {skip.isError ? (
            <p role="alert" className="text-xs text-negative">
              Skip failed: {errorMessage(skip.error)}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2" aria-label="Pending confirmations">
            {data.items.slice(0, limit).map((item) => (
              <li
                key={item.order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2/50 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium" title={item.order.marketTitle ?? undefined}>
                    {item.order.marketTitle ?? 'Unknown market'}
                  </span>
                  <span className="text-xs text-muted">
                    {shortAddress(item.order.traderAddress)} · {item.order.side}{' '}
                    {item.order.outcome ?? ''} · Position {formatUsd(item.preview.whaleSize, { compact: true })}{' '}
                    · {formatRelativeTime(item.order.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!item.preview.allowed ? <Badge variant="negative">Blocked</Badge> : null}
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => setSelected(item)}
                    aria-label={`Review copy of ${formatAmount(item.preview.amount)}`}
                  >
                    {compact ? 'Review' : `COPY ${formatAmount(item.preview.amount)}`}
                  </Button>
                  {compact ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={skip.isPending && skip.variables === item.order.id}
                      disabled={skip.isPending}
                      onClick={() => skip.mutate(item.order.id)}
                    >
                      SKIP
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </QueryBoundary>
      {selected ? (
        <ConfirmationModal
          key={selected.order.id}
          item={selected}
          open
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
