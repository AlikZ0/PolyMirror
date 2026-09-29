import type {
  CopyOrder,
  CopyOrderStatus,
  CopySettings,
  NotificationType,
  TradeFill,
  WsEventName,
  WsPayloads,
} from '@polymirror/shared';

export interface StoredTrade extends TradeFill {
  /** Database id (Trade.id) — the `sourceTradeId` of copy orders. */
  dbId: string;
  traderId: string;
}

export interface CopyOrderRecord extends CopyOrder {
  traderId: string;
  category: string | null;
  confirmIdempotencyKey: string | null;
}

export type NewCopyOrder = Omit<
  CopyOrderRecord,
  | 'id'
  | 'createdAt'
  | 'executedAt'
  | 'externalOrderId'
  | 'transactionHash'
  | 'fillPrice'
  | 'filledShares'
  | 'currentPrice'
  | 'pnl'
  | 'closedAt'
  | 'confirmIdempotencyKey'
> & { idempotencyKey: string };

export interface ExposureSnapshot {
  /** USDC committed today by EXECUTING / SUBMITTED / CONFIRMED orders. */
  dailyUsed: number;
  /** Count of open copied positions (EXECUTING / SUBMITTED / CONFIRMED and not closed). */
  openPositions: number;
  openExposure: number;
  realizedPnl: number;
}

/** Persistence port of the copy engine (Prisma in production, in-memory in tests). */
export interface CopyStore {
  getSettings(userId: string): Promise<CopySettings>;
  getTrade(tradeId: string): Promise<StoredTrade | null>;
  getOrder(id: string): Promise<CopyOrderRecord | null>;
  getOrderByConfirmKey(key: string): Promise<CopyOrderRecord | null>;
  /** Inserts the order unless one already exists for (userId, sourceTradeId). */
  insertOrderIfAbsent(order: NewCopyOrder): Promise<{ order: CopyOrderRecord; created: boolean }>;
  /**
   * Atomic compare-and-set: applies `patch` only if the current status is one of `from`.
   * Returns null when the transition lost a race or is not allowed.
   */
  transition(
    id: string,
    from: readonly CopyOrderStatus[],
    patch: Partial<CopyOrderRecord>,
  ): Promise<CopyOrderRecord | null>;
  update(id: string, patch: Partial<CopyOrderRecord>): Promise<CopyOrderRecord>;
  exposure(userId: string, dayStart: number, excludeOrderId?: string): Promise<ExposureSnapshot>;
  /** Serializes limit checks + state transitions of one user (daily limit / open positions races). */
  withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T>;
  listByStatus(statuses: readonly CopyOrderStatus[], limit: number): Promise<CopyOrderRecord[]>;
  listPending(userId: string): Promise<CopyOrderRecord[]>;
  listOpenConfirmed(limit: number): Promise<CopyOrderRecord[]>;
  audit(
    userId: string | null,
    action: string,
    entityId: string | null,
    payload?: unknown,
  ): Promise<void>;
}

export interface CopyEventsPort {
  emit<E extends WsEventName>(userId: string, event: E, data: WsPayloads[E]): void;
  notify(
    userId: string,
    n: {
      type: NotificationType;
      title: string;
      message: string;
      traderAddress?: string | null;
      copyOrderId?: string | null;
    },
  ): Promise<void>;
}

export interface MarketPort {
  getCurrentPrice(tokenId: string): Promise<number | null>;
  getMarketState(conditionId: string): Promise<{
    active: boolean | null;
    resolvedPrice?: (tokenId: string) => number | null;
    url: string | null;
    category: string | null;
  }>;
}

/** Strips server-internal fields before an order leaves the backend. */
export function publicOrder(o: CopyOrderRecord): CopyOrder {
  const { traderId: _t, category: _c, confirmIdempotencyKey: _k, ...rest } = o;
  return rest;
}
