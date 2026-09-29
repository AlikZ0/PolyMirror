import type { CopyOrder, CopyPreview, DetectedTrade, NotificationItem, WatchStatus } from './index';

export const WS_EVENTS = {
  TRADER_TRADE: 'trader.trade',
  COPY_PENDING: 'copy.pending',
  COPY_EXECUTING: 'copy.executing',
  COPY_SUCCESS: 'copy.success',
  COPY_FAILED: 'copy.failed',
  TRADER_STATUS: 'trader.status',
  CONNECTION_STATUS: 'connection.status',
  NOTIFICATION: 'notification',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface WsPayloads {
  'trader.trade': DetectedTrade;
  'copy.pending': { order: CopyOrder; preview: CopyPreview };
  'copy.executing': { order: CopyOrder };
  'copy.success': { order: CopyOrder };
  'copy.failed': { order: CopyOrder; reason: string };
  'trader.status': {
    traderAddress: string;
    status: WatchStatus | 'INACTIVE';
    lastTradeAt: number | null;
  };
  'connection.status': {
    status: 'connected' | 'authenticated' | 'error';
    message?: string;
    serverTime: number;
  };
  notification: NotificationItem;
}

export interface WsServerMessage<E extends WsEventName = WsEventName> {
  event: E;
  data: WsPayloads[E];
  /** Monotonic per-connection sequence number. */
  seq: number;
  ts: number;
}

export type WsClientMessage =
  { type: 'auth'; token: string } | { type: 'ping'; ts: number } | { type: 'resync' };
