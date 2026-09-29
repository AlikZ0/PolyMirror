import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { WsPayloads, WsServerMessage } from '@polymirror/shared';
import { UI_PORT_NAME } from '../config';
import { useConnectionStore } from '../stores/connectionStore';
import { useOrderUpdatesStore } from '../stores/orderUpdatesStore';
import type { BackgroundToUiMessage, UiToBackgroundMessage } from '../types/messages';
import { hasChrome } from '../utils/chromeApi';
import { queryKeys } from './queryKeys';

let activePort: chrome.runtime.Port | null = null;

function post(msg: UiToBackgroundMessage): void {
  try {
    activePort?.postMessage(msg);
  } catch {
    // Port closed; the bridge reconnects on its own.
  }
}

export const requestBadgeRefresh = () => post({ type: 'refresh-badge' });
export const requestReconnect = () => post({ type: 'reconnect' });

function invalidateCopyState(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.pending });
  void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  void qc.invalidateQueries({ queryKey: queryKeys.historyAll });
  void qc.invalidateQueries({ queryKey: queryKeys.statistics });
}

/** Applies a realtime event to local state. Events only refresh data; nothing is executed. */
export function applyWsEvent(qc: QueryClient, msg: WsServerMessage): void {
  const push = useOrderUpdatesStore.getState().push;
  switch (msg.event) {
    case 'copy.pending':
      invalidateCopyState(qc);
      break;
    case 'copy.executing':
    case 'copy.success': {
      const { order } = msg.data as WsPayloads['copy.success'];
      push(order);
      invalidateCopyState(qc);
      break;
    }
    case 'copy.failed': {
      const { order, reason } = msg.data as WsPayloads['copy.failed'];
      push({ ...order, status: 'FAILED', failureReason: order.failureReason ?? reason }, reason);
      invalidateCopyState(qc);
      break;
    }
    case 'trader.trade':
    case 'trader.status':
      void qc.invalidateQueries({ queryKey: queryKeys.watchlist });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      break;
    case 'notification':
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      break;
    default:
      break;
  }
}

/**
 * Subscribes the page to the background service worker (which owns the only WebSocket).
 * Re-attaches automatically when the worker restarts.
 */
export function useBackgroundBridge(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const { setSnapshot, setBridgeAvailable } = useConnectionStore.getState();
    if (!hasChrome() || !chrome.runtime.connect) {
      setBridgeAvailable(false);
      return;
    }
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attach = () => {
      if (disposed) return;
      let port: chrome.runtime.Port;
      try {
        port = chrome.runtime.connect({ name: UI_PORT_NAME });
      } catch {
        setBridgeAvailable(false);
        retryTimer = setTimeout(attach, 2_000);
        return;
      }
      activePort = port;
      setBridgeAvailable(true);
      port.onMessage.addListener((msg: BackgroundToUiMessage) => {
        if (msg.type === 'connection') setSnapshot(msg.snapshot);
        else if (msg.type === 'resync') invalidateCopyState(qc);
        else if (msg.type === 'ws-event') applyWsEvent(qc, msg.message);
      });
      port.onDisconnect.addListener(() => {
        if (activePort === port) activePort = null;
        if (!disposed) retryTimer = setTimeout(attach, 1_000);
      });
    };
    attach();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        activePort?.disconnect();
      } catch {
        // ignore
      }
      activePort = null;
    };
  }, [qc]);
}
