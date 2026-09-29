import { useState } from 'react';
import type { CopyOrder, CopyPreview } from '@polymirror/shared';
import { Button, Callout, Modal, Spinner } from '@polymirror/ui';
import {
  defaultCopyActions,
  useInvalidateCopyState,
  type CopyActions,
} from '../../hooks/mutations';
import { formatCountdown, useCountdown } from '../../hooks/useTimers';
import { isApiError } from '../../services/apiClient';
import { useOrderUpdatesStore } from '../../stores/orderUpdatesStore';
import { formatAmount } from '../../utils/format';
import { errorMessage } from '../common/QueryBoundary';
import { AssistedSteps } from './AssistedSteps';
import { LimitChecks } from './LimitChecks';
import { OrderDetails } from './OrderDetails';

export interface PendingItem {
  order: CopyOrder;
  preview: CopyPreview;
}

export interface ConfirmationModalProps {
  item: PendingItem;
  open: boolean;
  onClose: () => void;
  /** Injected in tests; defaults to the real API. */
  actions?: CopyActions;
}

type Phase = 'review' | 'copying' | 'skipping' | 'skipped' | 'done';

function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * "🐋 NEW WHALE TRADE" confirmation. A copy only happens when the user clicks COPY here.
 * Success is only claimed once the order status is CONFIRMED.
 */
export function ConfirmationModal({
  item,
  open,
  onClose,
  actions = defaultCopyActions,
}: ConfirmationModalProps) {
  const { preview } = item;
  const invalidate = useInvalidateCopyState();
  const [phase, setPhase] = useState<Phase>('review');
  const [resultOrder, setResultOrder] = useState<CopyOrder | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyRequested, setVerifyRequested] = useState(false);
  // One key per modal instance: a double click or manual retry can never create two orders.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const remaining = useCountdown(preview.expiresAt ?? item.order.expiresAt);
  const expired = remaining !== null && remaining <= 0;
  const failedChecks = preview.checks.filter((c) => c.state === 'fail');
  const blocked = !preview.allowed || failedChecks.length > 0;
  const copyOrderId = preview.copyOrderId ?? item.order.id;

  // Realtime updates (copy.success / copy.failed) for the order we submitted.
  const live = useOrderUpdatesStore((s) => (resultOrder ? s.updates[resultOrder.id] : undefined));
  const current: CopyOrder | null =
    resultOrder && live && isNewer(live.order, resultOrder) ? live.order : resultOrder;
  const liveReason = live?.reason ?? null;

  const onCopy = async () => {
    if (blocked || expired || phase !== 'review') return;
    setPhase('copying');
    setRequestError(null);
    try {
      const { order } = await actions.confirm({
        copyOrderId,
        confirm: true,
        expectedAmount: preview.amount,
        idempotencyKey,
      });
      setResultOrder(order);
      setPhase('done');
    } catch (e) {
      setRequestError(e);
      setPhase('review');
    } finally {
      invalidate();
    }
  };

  const onSkip = async () => {
    if (phase !== 'review') return;
    setPhase('skipping');
    setRequestError(null);
    try {
      await actions.skip({ copyOrderId });
      setPhase('skipped');
      invalidate();
      onClose();
    } catch (e) {
      setRequestError(e);
      setPhase('review');
    }
  };

  const onVerify = async () => {
    if (!current) return;
    setVerifying(true);
    setRequestError(null);
    try {
      const { order } = await actions.verify({ copyOrderId: current.id });
      setResultOrder(order);
      setVerifyRequested(true);
    } catch (e) {
      setRequestError(e);
    } finally {
      setVerifying(false);
      invalidate();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🐋 NEW WHALE TRADE" className="max-w-lg">
      <div className="flex flex-col gap-4" data-testid="confirmation-modal">
        <OrderDetails order={item.order} preview={preview} />

        <section aria-label="Limit checks" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Safety checks
          </h3>
          <LimitChecks checks={preview.checks} />
        </section>

        {phase === 'review' || phase === 'copying' || phase === 'skipping' ? (
          <>
            <div className="flex items-center justify-between text-xs" aria-live="polite">
              <span className="text-muted">Expires in</span>
              <span className={expired ? 'font-semibold text-negative' : 'font-mono text-fg'}>
                {remaining === null ? 'N/A' : expired ? 'Expired' : formatCountdown(remaining)}
              </span>
            </div>
            {blocked ? (
              <Callout variant="danger" role="alert" title="This trade cannot be copied">
                {failedChecks.length > 0
                  ? failedChecks.map((c) => c.message).join(' · ')
                  : 'The backend did not allow this copy.'}
              </Callout>
            ) : null}
            {requestError ? <RequestErrorCallout error={requestError} /> : null}
            <div className="flex gap-2">
              <Button
                variant="success"
                size="lg"
                className="flex-1 font-bold"
                disabled={blocked || expired || phase !== 'review'}
                loading={phase === 'copying'}
                onClick={() => void onCopy()}
              >
                {phase === 'copying' ? 'Copying…' : `COPY ${formatAmount(preview.amount)}`}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={phase !== 'review'}
                loading={phase === 'skipping'}
                onClick={() => void onSkip()}
              >
                SKIP
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              {preview.execution === 'demo'
                ? 'Demo execution: the order is simulated, no real funds are used.'
                : 'Assisted execution: you will place the order yourself on Polymarket.'}
            </p>
          </>
        ) : null}

        {phase === 'done' && current ? (
          <ResultView
            order={current}
            preview={preview}
            reason={liveReason}
            verifying={verifying}
            verifyRequested={verifyRequested}
            onVerify={() => void onVerify()}
            requestError={requestError}
            onClose={onClose}
          />
        ) : null}
      </div>
    </Modal>
  );
}

const ORDER_RANK: Record<CopyOrder['status'], number> = {
  PENDING: 0,
  EXECUTING: 1,
  SUBMITTED: 2,
  CONFIRMED: 3,
  SKIPPED: 3,
  FAILED: 3,
  CANCELLED: 3,
};

function isNewer(candidate: CopyOrder, base: CopyOrder): boolean {
  return ORDER_RANK[candidate.status] >= ORDER_RANK[base.status];
}

function RequestErrorCallout({ error }: { error: unknown }) {
  const checks = isApiError(error) ? error.failedChecks : [];
  return (
    <Callout variant="danger" role="alert" title="Copy not executed">
      {errorMessage(error)}
      {checks.length > 0 ? (
        <ul className="mt-1 list-disc pl-4">
          {checks.map((c) => (
            <li key={c.code}>{c.message}</li>
          ))}
        </ul>
      ) : null}
    </Callout>
  );
}

interface ResultViewProps {
  order: CopyOrder;
  preview: CopyPreview;
  reason: string | null;
  verifying: boolean;
  verifyRequested: boolean;
  onVerify: () => void;
  requestError: unknown;
  onClose: () => void;
}

function ResultView({
  order,
  preview,
  reason,
  verifying,
  verifyRequested,
  onVerify,
  requestError,
  onClose,
}: ResultViewProps) {
  if (order.status === 'CONFIRMED') {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-lg font-bold text-positive">Success ✓</p>
        <p className="text-sm text-fg/85">
          Copied {formatAmount(order.amount)} {order.side}
          {order.execution === 'demo' ? ' (simulated in demo mode)' : ''}.
        </p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (order.status === 'FAILED' || order.status === 'CANCELLED') {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="text-lg font-bold text-negative">Copy failed</p>
        <p className="text-sm text-fg/85">Reason: {order.failureReason ?? reason ?? 'Unknown'}</p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (order.status === 'SUBMITTED' && order.execution === 'assisted') {
    return (
      <div className="flex flex-col gap-3">
        <AssistedSteps
          order={order}
          preview={preview}
          verifying={verifying}
          verifyRequested={verifyRequested}
          onVerify={onVerify}
        />
        {requestError ? <RequestErrorCallout error={requestError} /> : null}
      </div>
    );
  }
  // PENDING / EXECUTING / SUBMITTED (demo): wait for the realtime result.
  return (
    <div className="flex items-center gap-2 text-sm" role="status">
      <Spinner size="sm" label="" /> Copying… waiting for confirmation from the server.
    </div>
  );
}
