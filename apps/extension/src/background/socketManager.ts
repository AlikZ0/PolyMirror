import type { WsPayloads, WsServerMessage } from '@polymirror/shared';
import { ReconnectingSocket, type SocketState } from '../services/reconnectingSocket';
import { getWebsocketUrl, refreshAfterUnauthorized, tryGetToken } from '../services/session';
import type { BackgroundToUiMessage, ConnectionSnapshot } from '../types/messages';
import { refreshBadge } from './badge';
import {
  clearConnectionLost,
  notifyConnectionLost,
  notifyCopyResult,
  notifyGeneric,
  notifyPending,
} from './notifications';

const CONNECTION_LOST_DEBOUNCE_MS = 30_000;
const AUTH_REFRESH_COOLDOWN_MS = 5 * 60_000;

type Broadcast = (msg: BackgroundToUiMessage) => void;

/**
 * Owns the single realtime connection of the extension. UI pages subscribe through runtime ports;
 * they never open their own socket, so there is exactly one source of truth.
 *
 * Nothing here can confirm a copy: incoming events only update the badge, show notifications and
 * are forwarded to the UI.
 */
export class SocketManager {
  private readonly socket: ReconnectingSocket;
  private snapshot: ConnectionSnapshot = {
    state: 'closed',
    lastAuthenticatedAt: null,
    nextRetryAt: null,
    attempt: 0,
    lastError: null,
  };
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private lostNotified = false;
  private lastAuthRefresh = 0;
  private currentToken: string | null = null;

  constructor(private readonly broadcast: Broadcast) {
    this.socket = new ReconnectingSocket({
      url: getWebsocketUrl,
      getToken: async () => {
        this.currentToken = await tryGetToken();
        return this.currentToken;
      },
      onStateChange: (state, info) => {
        this.snapshot = {
          ...this.snapshot,
          state,
          attempt: info.attempt,
          nextRetryAt: info.nextRetryAt,
          lastError: info.lastError,
          lastAuthenticatedAt: state === 'authenticated' ? Date.now() : this.snapshot.lastAuthenticatedAt,
        };
        this.broadcast({ type: 'connection', snapshot: this.snapshot });
        this.trackConnectionLoss(state);
        if (state === 'authenticated') void refreshBadge();
      },
      onMessage: (msg) => this.onMessage(msg),
      onResync: () => {
        // Refetch state only. Pending orders stay pending until the user acts on them.
        void refreshBadge();
        this.broadcast({ type: 'resync' });
      },
      onAuthError: () => {
        const now = Date.now();
        if (now - this.lastAuthRefresh < AUTH_REFRESH_COOLDOWN_MS) return;
        this.lastAuthRefresh = now;
        void refreshAfterUnauthorized(this.currentToken);
      },
    });
  }

  getSnapshot(): ConnectionSnapshot {
    return this.snapshot;
  }

  ensureConnected(): void {
    this.socket.connect();
  }

  restart(): void {
    this.socket.restart();
  }

  private onMessage(msg: WsServerMessage): void {
    this.broadcast({ type: 'ws-event', message: msg });
    switch (msg.event) {
      case 'copy.pending': {
        const { order, preview } = msg.data as WsPayloads['copy.pending'];
        void notifyPending(order, preview);
        void refreshBadge();
        break;
      }
      case 'copy.success': {
        const { order } = msg.data as WsPayloads['copy.success'];
        void notifyCopyResult(order);
        void refreshBadge();
        break;
      }
      case 'copy.failed': {
        const { order, reason } = msg.data as WsPayloads['copy.failed'];
        void notifyCopyResult({ ...order, status: 'FAILED' }, reason);
        void refreshBadge();
        break;
      }
      case 'copy.executing':
        void refreshBadge();
        break;
      case 'notification':
        void notifyGeneric(msg.data as WsPayloads['notification']);
        break;
      default:
        break;
    }
  }

  /** Debounced "connection lost" notification: only after a real outage, once per outage. */
  private trackConnectionLoss(state: SocketState): void {
    if (state === 'authenticated') {
      if (this.lostTimer) clearTimeout(this.lostTimer);
      this.lostTimer = null;
      if (this.lostNotified) void clearConnectionLost();
      this.lostNotified = false;
      return;
    }
    if (state === 'closed' || this.snapshot.lastAuthenticatedAt === null) return;
    if (this.lostTimer || this.lostNotified) return;
    this.lostTimer = setTimeout(() => {
      this.lostTimer = null;
      if (this.socket.getState() !== 'authenticated') {
        this.lostNotified = true;
        void notifyConnectionLost();
      }
    }, CONNECTION_LOST_DEBOUNCE_MS);
  }
}
