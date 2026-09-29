import type {
  ApiRoutes,
  CopyOrderStatus,
  CopySettings,
  HistoricalTradesQuery,
  ScannerFilters,
  TimePeriod,
  WatchStatus,
} from '@polymirror/shared';
import { createApiClient, type ApiClient } from './apiClient';
import { ensureToken, getApiUrl, refreshAfterUnauthorized } from './session';

type Res<K extends keyof ApiRoutes> = ApiRoutes[K]['response'];
type Body<K extends keyof ApiRoutes> = ApiRoutes[K] extends { body: infer B } ? B : never;

export const apiClient: ApiClient = createApiClient({
  getBaseUrl: getApiUrl,
  getToken: async () => ensureToken(),
  onUnauthorized: refreshAfterUnauthorized,
});

const enc = encodeURIComponent;

export interface CopyHistoryQuery {
  page?: number;
  pageSize?: number;
  status?: CopyOrderStatus | 'ALL';
  traderAddress?: string;
}

/** Typed endpoint functions for every backend route used by the extension. */
export function createApi(client: ApiClient) {
  const get = <T>(path: string, query?: object, signal?: AbortSignal, auth = true) =>
    client.request<T>('GET', path, { query, signal, auth });
  const send = <T>(method: string, path: string, body?: unknown) =>
    client.request<T>(method, path, { body });

  return {
    system: (signal?: AbortSignal) =>
      get<Res<'GET /api/system'>>('/api/system', undefined, signal, false),
    dashboard: (signal?: AbortSignal) => get<Res<'GET /api/dashboard'>>('/api/dashboard', undefined, signal),

    traders: (filters: ScannerFilters, signal?: AbortSignal) =>
      get<Res<'GET /api/traders'>>('/api/traders', filters, signal),
    trader: (address: string, signal?: AbortSignal) =>
      get<Res<'GET /api/traders/:address'>>(`/api/traders/${enc(address)}`, undefined, signal),
    traderTrades: (address: string, query: HistoricalTradesQuery, signal?: AbortSignal) =>
      get<Res<'GET /api/traders/:address/trades'>>(
        `/api/traders/${enc(address)}/trades`,
        query,
        signal,
      ),
    traderAnalytics: (address: string, period: TimePeriod, signal?: AbortSignal) =>
      get<Res<'GET /api/traders/:address/analytics'>>(
        `/api/traders/${enc(address)}/analytics`,
        { period },
        signal,
      ),
    traderPerformance: (address: string, signal?: AbortSignal) =>
      get<Res<'GET /api/traders/:address/performance'>>(
        `/api/traders/${enc(address)}/performance`,
        undefined,
        signal,
      ),

    watchlist: (signal?: AbortSignal) => get<Res<'GET /api/watchlist'>>('/api/watchlist', undefined, signal),
    addToWatchlist: (traderAddress: string) =>
      send<Res<'POST /api/watchlist'>>('POST', '/api/watchlist', {
        traderAddress,
      } satisfies Body<'POST /api/watchlist'>),
    updateWatchlist: (id: string, status: WatchStatus) =>
      send<Res<'PATCH /api/watchlist/:id'>>('PATCH', `/api/watchlist/${enc(id)}`, {
        status,
      } satisfies Body<'PATCH /api/watchlist/:id'>),
    removeFromWatchlist: (id: string) =>
      send<Res<'DELETE /api/watchlist/:id'>>('DELETE', `/api/watchlist/${enc(id)}`),

    copySettings: (signal?: AbortSignal) =>
      get<Res<'GET /api/copy/settings'>>('/api/copy/settings', undefined, signal),
    saveCopySettings: (settings: Omit<CopySettings, 'updatedAt'>) =>
      send<Res<'PUT /api/copy/settings'>>('PUT', '/api/copy/settings', settings),
    pending: (signal?: AbortSignal) =>
      get<Res<'GET /api/copy/pending'>>('/api/copy/pending', undefined, signal),
    preview: (sourceTradeId: string) =>
      send<Res<'POST /api/copy/preview'>>('POST', '/api/copy/preview', { sourceTradeId }),
    /** Explicit, user-initiated confirmation. Only ever called from a click handler. */
    confirm: (body: Body<'POST /api/copy/confirm'>) =>
      send<Res<'POST /api/copy/confirm'>>('POST', '/api/copy/confirm', body),
    skip: (body: Body<'POST /api/copy/skip'>) =>
      send<Res<'POST /api/copy/skip'>>('POST', '/api/copy/skip', body),
    verify: (body: Body<'POST /api/copy/verify'>) =>
      send<Res<'POST /api/copy/verify'>>('POST', '/api/copy/verify', body),
    history: (query: CopyHistoryQuery, signal?: AbortSignal) =>
      get<Res<'GET /api/copy/history'>>('/api/copy/history', query, signal),

    statistics: (signal?: AbortSignal) =>
      get<Res<'GET /api/statistics'>>('/api/statistics', undefined, signal),
    notifications: (signal?: AbortSignal) =>
      get<Res<'GET /api/notifications'>>('/api/notifications', undefined, signal),
    markNotificationsRead: (ids?: string[]) =>
      send<Res<'POST /api/notifications/read'>>('POST', '/api/notifications/read', { ids }),
  };
}

export type Api = ReturnType<typeof createApi>;

export const api: Api = createApi(apiClient);
