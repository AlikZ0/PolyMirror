import type { CopySettings as DbCopySettings, CopyOrder as DbCopyOrder, Prisma, Trade as DbTrade } from '@prisma/client';
import { DEFAULT_COPY_SETTINGS } from '@polymirror/shared';
import type { CopySettings } from '@polymirror/shared';
import type { CopyOrderRecord, StoredTrade } from '../modules/copy/types';

type Dec = Prisma.Decimal | null;
export const dec = (v: Dec): number | null => (v === null ? null : Number(v.toString()));
export const decReq = (v: Prisma.Decimal): number => Number(v.toString());
export const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());

export function toCopySettings(row: DbCopySettings | null): CopySettings {
  if (!row) return { ...DEFAULT_COPY_SETTINGS, updatedAt: 0 };
  return {
    mode: row.mode,
    sizingMode: row.sizingMode,
    fixedAmount: decReq(row.fixedAmount),
    percentage: decReq(row.percentage),
    minCopyAmount: decReq(row.minCopyAmount),
    maxPerTrade: decReq(row.maxPerTrade),
    maxDailyAmount: decReq(row.maxDailyAmount),
    maxOpenPositions: row.maxOpenPositions,
    minWhaleTrade: decReq(row.minWhaleTrade),
    maxSlippage: decReq(row.maxSlippage),
    minBalance: decReq(row.minBalance),
    confirmationRequired: row.confirmationRequired,
    allowedCategories: row.allowedCategories,
    excludedMarkets: row.excludedMarkets,
    walletAddress: row.walletAddress,
    updatedAt: row.updatedAt.getTime(),
  };
}

export function toCopyOrder(row: DbCopyOrder & { trader?: { address: string } }, traderAddress?: string): CopyOrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    traderId: row.traderId,
    traderAddress: traderAddress ?? row.trader?.address ?? '',
    sourceTradeId: row.sourceTradeId,
    conditionId: row.conditionId,
    tokenId: row.tokenId,
    marketTitle: row.marketTitle,
    marketUrl: row.marketUrl,
    outcome: row.outcome,
    category: row.category,
    side: row.side,
    whaleSize: decReq(row.whaleSize),
    whalePrice: decReq(row.whalePrice),
    amount: decReq(row.amount),
    estimatedShares: decReq(row.estimatedShares),
    status: row.status,
    execution: row.execution,
    failureReason: row.failureReason,
    externalOrderId: row.externalOrderId,
    transactionHash: row.transactionHash,
    fillPrice: dec(row.fillPrice),
    filledShares: dec(row.filledShares),
    currentPrice: dec(row.currentPrice),
    pnl: dec(row.pnl),
    closedAt: ms(row.closedAt),
    createdAt: row.createdAt.getTime(),
    executedAt: ms(row.executedAt),
    expiresAt: row.expiresAt.getTime(),
    confirmIdempotencyKey: row.confirmIdempotencyKey,
  };
}

/** Converts a partial CopyOrderRecord patch to Prisma update data. */
export function toCopyOrderUpdate(patch: Partial<CopyOrderRecord>): Prisma.CopyOrderUncheckedUpdateInput {
  const data: Prisma.CopyOrderUncheckedUpdateInput = {};
  const date = (v: number | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.failureReason !== undefined) data.failureReason = patch.failureReason;
  if (patch.externalOrderId !== undefined) data.externalOrderId = patch.externalOrderId;
  if (patch.transactionHash !== undefined) data.transactionHash = patch.transactionHash;
  if (patch.fillPrice !== undefined) data.fillPrice = patch.fillPrice;
  if (patch.filledShares !== undefined) data.filledShares = patch.filledShares;
  if (patch.currentPrice !== undefined) data.currentPrice = patch.currentPrice;
  if (patch.pnl !== undefined) data.pnl = patch.pnl;
  if (patch.amount !== undefined) data.amount = patch.amount;
  if (patch.confirmIdempotencyKey !== undefined) data.confirmIdempotencyKey = patch.confirmIdempotencyKey;
  if (patch.closedAt !== undefined) data.closedAt = date(patch.closedAt);
  if (patch.executedAt !== undefined) data.executedAt = date(patch.executedAt);
  return data;
}

export function toStoredTrade(row: DbTrade & { trader: { address: string } }): StoredTrade {
  return {
    id: row.sourceId,
    dbId: row.id,
    traderId: row.traderId,
    traderAddress: row.trader.address,
    conditionId: row.conditionId,
    tokenId: row.tokenId,
    side: row.side,
    size: row.size,
    price: row.price,
    notional: row.notional,
    timestamp: row.timestamp.getTime(),
    marketTitle: row.marketTitle,
    marketSlug: row.marketSlug,
    eventSlug: row.eventSlug,
    outcome: row.outcome,
    outcomeIndex: null,
    transactionHash: row.transactionHash,
    category: row.category,
  };
}
