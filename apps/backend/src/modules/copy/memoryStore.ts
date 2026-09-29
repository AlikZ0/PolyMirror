import { DEFAULT_COPY_SETTINGS } from '@polymirror/shared';
import type { CopyOrderStatus, CopySettings } from '@polymirror/shared';
import type { CopyOrderRecord, CopyStore, ExposureSnapshot, NewCopyOrder, StoredTrade } from './types';

const COMMITTED: CopyOrderStatus[] = ['EXECUTING', 'SUBMITTED', 'CONFIRMED'];

/** In-memory CopyStore with the same semantics as the Prisma store (tests, local tooling). */
export class MemoryCopyStore implements CopyStore {
  readonly orders = new Map<string, CopyOrderRecord>();
  readonly trades = new Map<string, StoredTrade>();
  readonly settings = new Map<string, CopySettings>();
  readonly audits: Array<{ userId: string | null; action: string; entityId: string | null; payload?: unknown }> = [];
  private seq = 0;
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  setSettings(userId: string, patch: Partial<CopySettings>) {
    this.settings.set(userId, { ...DEFAULT_COPY_SETTINGS, updatedAt: 0, ...this.settings.get(userId), ...patch });
  }

  async getSettings(userId: string) {
    return this.settings.get(userId) ?? { ...DEFAULT_COPY_SETTINGS, updatedAt: 0 };
  }
  async getTrade(id: string) {
    return this.trades.get(id) ?? null;
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }
  async getOrderByConfirmKey(key: string) {
    for (const o of this.orders.values()) if (o.confirmIdempotencyKey === key) return { ...o };
    return null;
  }
  async insertOrderIfAbsent(input: NewCopyOrder) {
    for (const o of this.orders.values()) {
      if (o.userId === input.userId && o.sourceTradeId === input.sourceTradeId) return { order: { ...o }, created: false };
    }
    const { idempotencyKey: _key, ...rest } = input;
    const order: CopyOrderRecord = {
      ...rest,
      id: `order_${++this.seq}`,
      createdAt: this.now(),
      executedAt: null,
      externalOrderId: null,
      transactionHash: null,
      fillPrice: null,
      filledShares: null,
      currentPrice: null,
      pnl: null,
      closedAt: null,
      confirmIdempotencyKey: null,
    };
    this.orders.set(order.id, order);
    return { order: { ...order }, created: true };
  }
  async transition(id: string, from: readonly CopyOrderStatus[], patch: Partial<CopyOrderRecord>) {
    const o = this.orders.get(id);
    if (!o || !from.includes(o.status)) return null;
    if (patch.confirmIdempotencyKey) {
      for (const other of this.orders.values()) {
        if (other.id !== id && other.confirmIdempotencyKey === patch.confirmIdempotencyKey) return null;
      }
    }
    Object.assign(o, patch);
    return { ...o };
  }
  async update(id: string, patch: Partial<CopyOrderRecord>) {
    const o = this.orders.get(id)!;
    Object.assign(o, patch);
    return { ...o };
  }
  async exposure(userId: string, dayStart: number, excludeOrderId?: string): Promise<ExposureSnapshot> {
    let dailyUsed = 0;
    let openPositions = 0;
    let openExposure = 0;
    let realizedPnl = 0;
    for (const o of this.orders.values()) {
      if (o.userId !== userId) continue;
      if (o.status === 'CONFIRMED' && o.closedAt !== null) realizedPnl += o.pnl ?? 0;
      if (o.id === excludeOrderId || !COMMITTED.includes(o.status)) continue;
      if ((o.executedAt ?? 0) >= dayStart) dailyUsed += o.amount;
      if (o.closedAt === null) {
        openPositions++;
        openExposure += o.amount;
      }
    }
    return { dailyUsed, openPositions, openExposure, realizedPnl };
  }
  async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(userId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(userId, run.catch(() => undefined));
    return run;
  }
  async listByStatus(statuses: readonly CopyOrderStatus[], limit: number) {
    return [...this.orders.values()].filter((o) => statuses.includes(o.status)).slice(0, limit).map((o) => ({ ...o }));
  }
  async listPending(userId: string) {
    return [...this.orders.values()].filter((o) => o.userId === userId && o.status === 'PENDING').map((o) => ({ ...o }));
  }
  async listOpenConfirmed(limit: number) {
    return [...this.orders.values()].filter((o) => o.status === 'CONFIRMED' && o.closedAt === null).slice(0, limit).map((o) => ({ ...o }));
  }
  async audit(userId: string | null, action: string, entityId: string | null, payload?: unknown) {
    this.audits.push({ userId, action, entityId, payload });
  }
}
