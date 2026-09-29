import { z } from 'zod';
import { SAFETY_LIMITS } from '../constants';

export const evmAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Expected a 0x-prefixed 40 hex character address')
  .transform((v) => v.toLowerCase());

export const timePeriodSchema = z.enum(['1d', '7d', '30d', '90d', 'all']);

const optionalNumber = z.coerce.number().finite().optional();

export const scannerFiltersSchema = z.object({
  minTradeSize: optionalNumber,
  minTotalVolume: optionalNumber,
  minTrades: optionalNumber,
  period: timePeriodSchema.default('30d'),
  category: z.string().trim().min(1).optional(),
  activity: z.enum(['active', 'inactive', 'any']).default('any'),
  minPnl: optionalNumber,
  minRoi: optionalNumber,
  minWinRate: optionalNumber,
  minAveragePosition: optionalNumber,
  maxDrawdown: optionalNumber,
  sortBy: z
    .enum([
      'totalVolume',
      'tradeCount',
      'averagePosition',
      'pnl',
      'roi',
      'winRate',
      'lastActive',
      'maxDrawdown',
    ])
    .default('totalVolume'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const historicalTradesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.enum(['date', 'positionSize', 'pnl', 'roi', 'market']).default('date'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['OPEN', 'CLOSED', 'RESOLVED', 'ALL']).default('ALL'),
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
});

export const analyticsQuerySchema = z.object({
  period: timePeriodSchema.default('all'),
});

const money = (max: number) => z.number().finite().min(0).max(max);

export const copySettingsInputSchema = z
  .object({
    mode: z.enum(['MANUAL', 'AUTOMATIC']),
    sizingMode: z.enum(['FIXED', 'PERCENTAGE']),
    fixedAmount: money(SAFETY_LIMITS.MAX_COPY_AMOUNT),
    percentage: z.number().finite().min(0).max(100),
    minCopyAmount: money(SAFETY_LIMITS.MAX_COPY_AMOUNT),
    maxPerTrade: money(SAFETY_LIMITS.MAX_COPY_AMOUNT),
    maxDailyAmount: money(SAFETY_LIMITS.MAX_DAILY_COPY_VOLUME),
    maxOpenPositions: z.number().int().min(0).max(SAFETY_LIMITS.MAX_OPEN_POSITIONS),
    minWhaleTrade: z.number().finite().min(SAFETY_LIMITS.MIN_WHALE_TRADE_SIZE),
    maxSlippage: z.number().finite().min(0).max(SAFETY_LIMITS.MAX_SLIPPAGE),
    minBalance: z.number().finite().min(SAFETY_LIMITS.MIN_BALANCE),
    confirmationRequired: z.boolean(),
    allowedCategories: z.array(z.string().trim().min(1).max(64)).max(50),
    excludedMarkets: z.array(z.string().trim().min(1).max(128)).max(500),
    walletAddress: evmAddressSchema.nullable(),
  })
  .refine((s) => s.minCopyAmount <= s.maxPerTrade, {
    message: 'Minimum copy amount must not exceed maximum per trade',
    path: ['minCopyAmount'],
  })
  .refine((s) => s.maxPerTrade <= s.maxDailyAmount, {
    message: 'Maximum per trade must not exceed the daily maximum',
    path: ['maxPerTrade'],
  })
  .refine((s) => s.mode === 'AUTOMATIC' || s.confirmationRequired, {
    message: 'Manual mode always requires confirmation',
    path: ['confirmationRequired'],
  });

export type CopySettingsInput = z.infer<typeof copySettingsInputSchema>;

export const watchlistCreateSchema = z.object({
  traderAddress: evmAddressSchema,
});

export const watchlistUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']),
});

export const copyPreviewSchema = z.object({
  sourceTradeId: z.string().min(1).max(256),
});

export const copyConfirmSchema = z.object({
  copyOrderId: z.string().min(1).max(64),
  /** Must be literally true: an explicit, user-initiated confirmation. */
  confirm: z.literal(true),
  /** The amount the user saw. The server rejects the confirmation if it no longer matches. */
  expectedAmount: z.number().finite().positive(),
  /** Client-generated idempotency key for the confirmation request. */
  idempotencyKey: z.string().min(8).max(128),
});

export const copySkipSchema = z.object({
  copyOrderId: z.string().min(1).max(64),
  reason: z.string().max(200).optional(),
});

export const copyHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  status: z
    .enum(['PENDING', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'SKIPPED', 'FAILED', 'CANCELLED', 'ALL'])
    .default('ALL'),
  traderAddress: evmAddressSchema.optional(),
});

export const assistedFillReportSchema = z.object({
  copyOrderId: z.string().min(1).max(64),
});
