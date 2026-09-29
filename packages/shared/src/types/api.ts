/**
 * REST API contract between the extension and the backend.
 * All endpoints are prefixed with /api and (except /api/system and /api/users/register)
 * require `Authorization: Bearer <apiToken>`.
 *
 * Errors: non-2xx responses carry `ApiErrorBody`.
 */
import type {
  CopyOrder,
  CopyPreview,
  CopySettings,
  DashboardSummary,
  HistoricalTradeRow,
  NotificationItem,
  Paginated,
  PerformanceComparison,
  SystemInfo,
  TraderAnalytics,
  TraderProfile,
  TraderSummary,
  UserStatistics,
  WatchlistItem,
} from './index';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LIMIT_VIOLATION'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ApiRoutes {
  'GET /api/system': { response: SystemInfo };
  'POST /api/users/register': { response: { userId: string; apiToken: string } };
  'GET /api/dashboard': { response: DashboardSummary };
  /** Query: ScannerFilters */
  'GET /api/traders': { response: { items: TraderSummary[]; generatedAt: number; source: string } };
  'GET /api/traders/:address': { response: TraderProfile };
  /** Query: HistoricalTradesQuery */
  'GET /api/traders/:address/trades': { response: Paginated<HistoricalTradeRow> };
  /** Query: { period } */
  'GET /api/traders/:address/analytics': { response: TraderAnalytics };
  'GET /api/traders/:address/performance': { response: PerformanceComparison };
  'GET /api/watchlist': { response: { items: WatchlistItem[] } };
  'POST /api/watchlist': { body: { traderAddress: string }; response: WatchlistItem };
  'PATCH /api/watchlist/:id': { body: { status: 'ACTIVE' | 'PAUSED' }; response: WatchlistItem };
  'DELETE /api/watchlist/:id': { response: { ok: true } };
  'GET /api/copy/settings': { response: CopySettings };
  'PUT /api/copy/settings': { body: Omit<CopySettings, 'updatedAt'>; response: CopySettings };
  'GET /api/copy/pending': { response: { items: Array<{ order: CopyOrder; preview: CopyPreview }> } };
  'POST /api/copy/preview': { body: { sourceTradeId: string }; response: CopyPreview };
  'POST /api/copy/confirm': {
    body: { copyOrderId: string; confirm: true; expectedAmount: number; idempotencyKey: string };
    response: { order: CopyOrder };
  };
  'POST /api/copy/skip': { body: { copyOrderId: string; reason?: string }; response: { order: CopyOrder } };
  /** Assisted mode: the user says they placed the order on Polymarket; triggers verification. */
  'POST /api/copy/verify': { body: { copyOrderId: string }; response: { order: CopyOrder } };
  /** Query: page, pageSize, status, traderAddress */
  'GET /api/copy/history': { response: Paginated<CopyOrder> };
  'GET /api/statistics': { response: UserStatistics };
  'GET /api/notifications': { response: { items: NotificationItem[]; unread: number } };
  'POST /api/notifications/read': { body: { ids?: string[] }; response: { ok: true } };
}
