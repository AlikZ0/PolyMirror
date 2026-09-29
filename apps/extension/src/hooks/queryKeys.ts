import type { HistoricalTradesQuery, ScannerFilters, TimePeriod } from '@polymirror/shared';
import type { CopyHistoryQuery } from '../services/api';

export const queryKeys = {
  system: ['system'] as const,
  dashboard: ['dashboard'] as const,
  traders: (f: ScannerFilters) => ['traders', f] as const,
  trader: (address: string) => ['trader', address] as const,
  traderTrades: (address: string, q: HistoricalTradesQuery) =>
    ['trader', address, 'trades', q] as const,
  traderAnalytics: (address: string, period: TimePeriod) =>
    ['trader', address, 'analytics', period] as const,
  traderPerformance: (address: string) => ['trader', address, 'performance'] as const,
  watchlist: ['watchlist'] as const,
  copySettings: ['copy', 'settings'] as const,
  pending: ['copy', 'pending'] as const,
  history: (q: CopyHistoryQuery) => ['copy', 'history', q] as const,
  historyAll: ['copy', 'history'] as const,
  statistics: ['statistics'] as const,
  notifications: ['notifications'] as const,
};
