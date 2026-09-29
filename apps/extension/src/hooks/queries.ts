import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { HistoricalTradesQuery, ScannerFilters, TimePeriod } from '@polymirror/shared';
import { api, type CopyHistoryQuery } from '../services/api';
import { queryKeys } from './queryKeys';

export const useSystem = () =>
  useQuery({
    queryKey: queryKeys.system,
    queryFn: ({ signal }) => api.system(signal),
    staleTime: 60_000,
  });

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: ({ signal }) => api.dashboard(signal) });

export const useTraders = (filters: ScannerFilters) =>
  useQuery({
    queryKey: queryKeys.traders(filters),
    queryFn: ({ signal }) => api.traders(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

export const useTrader = (address: string) =>
  useQuery({
    queryKey: queryKeys.trader(address),
    queryFn: ({ signal }) => api.trader(address, signal),
  });

export const useTraderTrades = (address: string, query: HistoricalTradesQuery) =>
  useQuery({
    queryKey: queryKeys.traderTrades(address, query),
    queryFn: ({ signal }) => api.traderTrades(address, query, signal),
    placeholderData: keepPreviousData,
  });

export const useTraderAnalytics = (address: string, period: TimePeriod) =>
  useQuery({
    queryKey: queryKeys.traderAnalytics(address, period),
    queryFn: ({ signal }) => api.traderAnalytics(address, period, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

export const useTraderPerformance = (address: string) =>
  useQuery({
    queryKey: queryKeys.traderPerformance(address),
    queryFn: ({ signal }) => api.traderPerformance(address, signal),
  });

export const useWatchlist = () =>
  useQuery({ queryKey: queryKeys.watchlist, queryFn: ({ signal }) => api.watchlist(signal) });

export const useCopySettings = () =>
  useQuery({ queryKey: queryKeys.copySettings, queryFn: ({ signal }) => api.copySettings(signal) });

export const usePending = () =>
  useQuery({
    queryKey: queryKeys.pending,
    queryFn: ({ signal }) => api.pending(signal),
    staleTime: 5_000,
    refetchInterval: 30_000,
  });

export const useHistory = (q: CopyHistoryQuery) =>
  useQuery({
    queryKey: queryKeys.history(q),
    queryFn: ({ signal }) => api.history(q, signal),
    placeholderData: keepPreviousData,
  });

export const useStatistics = () =>
  useQuery({ queryKey: queryKeys.statistics, queryFn: ({ signal }) => api.statistics(signal) });

export const useNotifications = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.notifications(signal),
  });
