import type { WsServerMessage } from '@polymirror/shared';
import type { SocketState } from '../services/reconnectingSocket';

/** Snapshot of the background socket, broadcast to every open extension page. */
export interface ConnectionSnapshot {
  state: SocketState;
  /** Epoch ms of the last successful authentication, null if never. */
  lastAuthenticatedAt: number | null;
  /** Next reconnect attempt (epoch ms) while reconnecting. */
  nextRetryAt: number | null;
  attempt: number;
  lastError: string | null;
}

/** Messages from the background service worker to UI pages (over a runtime Port). */
export type BackgroundToUiMessage =
  | { type: 'connection'; snapshot: ConnectionSnapshot }
  | { type: 'ws-event'; message: WsServerMessage }
  | { type: 'resync' };

/** Messages from UI pages to the background. None of them can execute a trade. */
export type UiToBackgroundMessage =
  { type: 'reconnect' } | { type: 'refresh-badge' } | { type: 'get-connection' };
