import { create } from 'zustand';
import type { CopyOrder } from '@polymirror/shared';

interface OrderUpdate {
  order: CopyOrder;
  reason: string | null;
  receivedAt: number;
}

interface OrderUpdatesStore {
  /** Latest realtime status per copy order id (from copy.executing/success/failed events). */
  updates: Record<string, OrderUpdate>;
  push: (order: CopyOrder, reason?: string | null) => void;
}

export const useOrderUpdatesStore = create<OrderUpdatesStore>((set) => ({
  updates: {},
  push: (order, reason = null) =>
    set((s) => ({
      updates: { ...s.updates, [order.id]: { order, reason, receivedAt: Date.now() } },
    })),
}));
