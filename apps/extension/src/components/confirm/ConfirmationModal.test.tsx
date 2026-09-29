import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CopyActions } from '../../hooks/mutations';
import { makeOrder, makePreview, passingChecks } from '../../test/fixtures';
import { ConfirmationModal, type PendingItem } from './ConfirmationModal';

function setup(item: PendingItem, actions: Partial<CopyActions> = {}) {
  const full: CopyActions = {
    confirm: vi.fn(async () => ({ order: { ...item.order, status: 'CONFIRMED' as const } })),
    skip: vi.fn(async () => ({ order: { ...item.order, status: 'SKIPPED' as const } })),
    verify: vi.fn(async () => ({ order: item.order })),
    ...actions,
  };
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ConfirmationModal item={item} open onClose={onClose} actions={full} />
    </QueryClientProvider>,
  );
  return { actions: full, onClose };
}

const copyButton = () => screen.getByRole('button', { name: /COPY \$10/ }) as HTMLButtonElement;

describe('ConfirmationModal', () => {
  it('shows the trade details and the user amount (not the whale size) on the COPY button', () => {
    setup({ order: makeOrder(), preview: makePreview() });
    expect(screen.getByRole('dialog', { name: /NEW WHALE TRADE/ })).toBeTruthy();
    expect(copyButton().disabled).toBe(false);
    expect(screen.getByText('$100,000')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'passed' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'could not be checked' })).toBeTruthy();
  });

  it('disables COPY when a limit check fails', () => {
    const { actions } = setup({
      order: makeOrder(),
      preview: makePreview({
        allowed: false,
        checks: [
          ...passingChecks,
          { code: 'MAX_OPEN_POSITIONS', passed: false, state: 'fail', message: 'Daily limit of $100 reached' },
        ],
      }),
    });
    expect(copyButton().disabled).toBe(true);
    expect(screen.getAllByText(/Daily limit of \$100 reached/).length).toBeGreaterThan(0);
    fireEvent.click(copyButton());
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('disables COPY when a check fails even if the server flag says allowed', () => {
    setup({
      order: makeOrder(),
      preview: makePreview({
        checks: [{ code: 'MAX_SLIPPAGE', passed: false, state: 'fail', message: 'Price moved 5%' }],
      }),
    });
    expect(copyButton().disabled).toBe(true);
  });

  it('disables COPY when the proposal has expired', () => {
    setup({ order: makeOrder(), preview: makePreview({ expiresAt: Date.now() - 1 }) });
    expect(copyButton().disabled).toBe(true);
    expect(screen.getByText('Expired')).toBeTruthy();
  });

  it('confirms with confirm:true, the expected amount and an idempotency key, then shows success', async () => {
    const { actions } = setup({ order: makeOrder(), preview: makePreview() });
    fireEvent.click(copyButton());
    await waitFor(() => expect(screen.getByText('Success ✓')).toBeTruthy());
    expect(actions.confirm).toHaveBeenCalledTimes(1);
    const body = vi.mocked(actions.confirm).mock.calls[0]![0];
    expect(body.confirm).toBe(true);
    expect(body.expectedAmount).toBe(10);
    expect(body.copyOrderId).toBe('order-1');
    expect(body.idempotencyKey.length).toBeGreaterThanOrEqual(8);
  });

  it('shows the failure reason when the order failed', async () => {
    setup(
      { order: makeOrder(), preview: makePreview() },
      {
        confirm: vi.fn(async () => ({
          order: makeOrder({ status: 'FAILED', failureReason: 'Market closed before execution' }),
        })),
      },
    );
    fireEvent.click(copyButton());
    await waitFor(() => expect(screen.getByText('Copy failed')).toBeTruthy());
    expect(screen.getByText('Reason: Market closed before execution')).toBeTruthy();
    expect(screen.queryByText('Success ✓')).toBeNull();
  });

  it('does not claim success for an assisted order that is only SUBMITTED', async () => {
    const verify = vi.fn(async () => ({ order: makeOrder({ status: 'SUBMITTED', execution: 'assisted' }) }));
    setup(
      { order: makeOrder({ execution: 'assisted' }), preview: makePreview({ execution: 'assisted' }) },
      {
        confirm: vi.fn(async () => ({ order: makeOrder({ status: 'SUBMITTED', execution: 'assisted' }) })),
        verify,
      },
    );
    fireEvent.click(copyButton());
    await waitFor(() => expect(screen.getByTestId('assisted-steps')).toBeTruthy());
    expect(screen.queryByText('Success ✓')).toBeNull();
    expect(screen.getByRole('button', { name: /Open on Polymarket/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I placed the order' }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ copyOrderId: 'order-1' }));
    await waitFor(() => expect(screen.getByText(/Verification requested/)).toBeTruthy());
    expect(screen.queryByText('Success ✓')).toBeNull();
  });

  it('skips via the skip action and closes', async () => {
    const { actions, onClose } = setup({ order: makeOrder(), preview: makePreview() });
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.skip).toHaveBeenCalledWith({ copyOrderId: 'order-1' });
    expect(actions.confirm).not.toHaveBeenCalled();
  });
});
