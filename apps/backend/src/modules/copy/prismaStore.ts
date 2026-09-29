import type { CopyOrderStatus } from '@polymirror/shared';
import { Prisma } from '@prisma/client';
import type { Db } from '../../database/prisma';
import { isUniqueViolation } from '../../database/prisma';
import { toCopyOrder, toCopyOrderUpdate, toCopySettings, toStoredTrade } from '../../database/mappers';
import type { CopyOrderRecord, CopyStore, ExposureSnapshot, NewCopyOrder, StoredTrade } from './types';

const withTrader = { trader: { select: { address: true } } } as const;
const COMMITTED: CopyOrderStatus[] = ['EXECUTING', 'SUBMITTED', 'CONFIRMED'];

export class PrismaCopyStore implements CopyStore {
  private readonly localLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly db: Db) {}

  async getSettings(userId: string) {
    return toCopySettings(await this.db.copySettings.findUnique({ where: { userId } }));
  }

  async getTrade(tradeId: string): Promise<StoredTrade | null> {
    const row = await this.db.trade.findUnique({ where: { id: tradeId }, include: withTrader });
    return row ? toStoredTrade(row) : null;
  }

  async getOrder(id: string): Promise<CopyOrderRecord | null> {
    const row = await this.db.copyOrder.findUnique({ where: { id }, include: withTrader });
    return row ? toCopyOrder(row) : null;
  }

  async getOrderByConfirmKey(key: string): Promise<CopyOrderRecord | null> {
    const row = await this.db.copyOrder.findUnique({ where: { confirmIdempotencyKey: key }, include: withTrader });
    return row ? toCopyOrder(row) : null;
  }

  async insertOrderIfAbsent(order: NewCopyOrder): Promise<{ order: CopyOrderRecord; created: boolean }> {
    try {
      const row = await this.db.copyOrder.create({
        data: {
          userId: order.userId,
          traderId: order.traderId,
          sourceTradeId: order.sourceTradeId,
          idempotencyKey: order.idempotencyKey,
          conditionId: order.conditionId,
          tokenId: order.tokenId,
          marketTitle: order.marketTitle,
          marketUrl: order.marketUrl,
          outcome: order.outcome,
          category: order.category,
          side: order.side,
          whaleSize: order.whaleSize,
          whalePrice: order.whalePrice,
          amount: order.amount,
          estimatedShares: order.estimatedShares,
          status: order.status,
          execution: order.execution,
          failureReason: order.failureReason,
          expiresAt: new Date(order.expiresAt),
        },
        include: withTrader,
      });
      return { order: toCopyOrder(row), created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.db.copyOrder.findUnique({ where: { idempotencyKey: order.idempotencyKey }, include: withTrader });
      if (!existing) throw err;
      return { order: toCopyOrder(existing), created: false };
    }
  }

  async transition(id: string, from: readonly CopyOrderStatus[], patch: Partial<CopyOrderRecord>) {
    try {
      const res = await this.db.copyOrder.updateMany({
        where: { id, status: { in: [...from] } },
        data: toCopyOrderUpdate(patch) as Prisma.CopyOrderUpdateManyMutationInput,
      });
      if (res.count === 0) return null;
    } catch (err) {
      if (isUniqueViolation(err)) return null; // confirm idempotency key raced
      throw err;
    }
    return this.getOrder(id);
  }

  async update(id: string, patch: Partial<CopyOrderRecord>) {
    const row = await this.db.copyOrder.update({ where: { id }, data: toCopyOrderUpdate(patch), include: withTrader });
    return toCopyOrder(row);
  }

  async exposure(userId: string, dayStart: number, excludeOrderId?: string): Promise<ExposureSnapshot> {
    const exclude = excludeOrderId ? { id: { not: excludeOrderId } } : {};
    const [daily, open, realized] = await Promise.all([
      this.db.copyOrder.aggregate({
        _sum: { amount: true },
        where: { userId, status: { in: COMMITTED }, executedAt: { gte: new Date(dayStart) }, ...exclude },
      }),
      this.db.copyOrder.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { userId, status: { in: COMMITTED }, closedAt: null, ...exclude },
      }),
      this.db.copyOrder.aggregate({
        _sum: { pnl: true },
        where: { userId, status: 'CONFIRMED', closedAt: { not: null } },
      }),
    ]);
    return {
      dailyUsed: Number(daily._sum.amount ?? 0),
      openPositions: open._count._all,
      openExposure: Number(open._sum.amount ?? 0),
      realizedPnl: Number(realized._sum.pnl ?? 0),
    };
  }

  /**
   * Process-local mutex + a PostgreSQL advisory transaction lock, so limit checks and the
   * PENDING -> EXECUTING transition are serialized per user across backend instances.
   */
  async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.localLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((r) => (release = r));
    const chained = prev.then(() => current);
    this.localLocks.set(userId, chained);
    await prev;
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
          return fn();
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } finally {
      release();
      if (this.localLocks.get(userId) === chained) this.localLocks.delete(userId);
    }
  }

  async listByStatus(statuses: readonly CopyOrderStatus[], limit: number) {
    const rows = await this.db.copyOrder.findMany({
      where: { status: { in: [...statuses] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: withTrader,
    });
    return rows.map((r) => toCopyOrder(r));
  }

  async listPending(userId: string) {
    const rows = await this.db.copyOrder.findMany({
      where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: withTrader,
    });
    return rows.map((r) => toCopyOrder(r));
  }

  async listOpenConfirmed(limit: number) {
    const rows = await this.db.copyOrder.findMany({
      where: { status: 'CONFIRMED', closedAt: null },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      include: withTrader,
    });
    return rows.map((r) => toCopyOrder(r));
  }

  async audit(userId: string | null, action: string, entityId: string | null, payload?: unknown) {
    await this.db.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'CopyOrder',
        entityId,
        payload: payload === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue),
      },
    });
  }
}
