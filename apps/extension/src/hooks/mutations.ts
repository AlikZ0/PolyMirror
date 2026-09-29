import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CopySettings, WatchStatus } from '@polymirror/shared';
import { api, type Api } from '../services/api';
import { queryKeys } from './queryKeys';
import { requestBadgeRefresh } from './useBackgroundBridge';

/** Invalidates everything that depends on copy order state. */
export function useInvalidateCopyState() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.pending });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    void qc.invalidateQueries({ queryKey: queryKeys.historyAll });
    void qc.invalidateQueries({ queryKey: queryKeys.statistics });
    requestBadgeRefresh();
  };
}

export function useWatchlistMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.watchlist });
    void qc.invalidateQueries({ queryKey: ['trader'] });
    void qc.invalidateQueries({ queryKey: ['traders'] });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  };
  const add = useMutation({ mutationFn: (address: string) => api.addToWatchlist(address), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.removeFromWatchlist(id), onSuccess: invalidate });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WatchStatus }) => api.updateWatchlist(id, status),
    onSuccess: invalidate,
  });
  return { add, remove, setStatus };
}

export function useSaveCopySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Omit<CopySettings, 'updatedAt'>) => api.saveCopySettings(settings),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.copySettings, saved);
      void qc.invalidateQueries({ queryKey: queryKeys.pending });
    },
  });
}

/** The three user-initiated copy actions. Injectable so components can be tested in isolation. */
export type CopyActions = Pick<Api, 'confirm' | 'skip' | 'verify'>;

export const defaultCopyActions: CopyActions = {
  confirm: (body) => api.confirm(body),
  skip: (body) => api.skip(body),
  verify: (body) => api.verify(body),
};
