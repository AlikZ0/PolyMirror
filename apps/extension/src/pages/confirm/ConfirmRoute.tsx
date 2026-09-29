import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, Spinner } from '@polymirror/ui';
import { ConfirmationModal, type PendingItem } from '../../components/confirm/ConfirmationModal';
import { errorMessage } from '../../components/common/QueryBoundary';
import { usePending } from '../../hooks/queries';
import { DashboardPage } from '../dashboard/DashboardPage';

/** `#/confirm/:id` — the dashboard with the confirmation modal of one pending order on top. */
export function ConfirmRoute() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const pending = usePending();
  const close = () => navigate('/', { replace: true });
  const found = pending.data?.items.find((i) => i.order.id === id || i.preview.copyOrderId === id);
  // Freeze the order once found: after COPY it leaves the pending list, but the modal must keep
  // showing its result (Copying… → Success / failure reason).
  const [frozen, setFrozen] = useState<{ id: string; item: PendingItem } | null>(null);
  if (found && frozen?.id !== id) setFrozen({ id, item: found });
  const item = frozen?.id === id ? frozen.item : found;

  return (
    <>
      <DashboardPage />
      {item ? (
        <ConfirmationModal key={item.order.id} item={item} open onClose={close} />
      ) : (
        <Modal open onClose={close} title="🐋 NEW WHALE TRADE">
          {pending.isPending ? (
            <div className="flex items-center gap-2 text-sm">
              <Spinner size="sm" /> Loading order…
            </div>
          ) : pending.isError ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-negative">{errorMessage(pending.error)}</p>
              <Button variant="secondary" onClick={() => void pending.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                This order is no longer pending — it was already handled, skipped or has expired.
              </p>
              <Button variant="secondary" onClick={() => navigate('/activity')}>
                View activity
              </Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
