/**
 * PolyMirror background service worker (MV3, ES module).
 *
 * Responsibilities: realtime connection, desktop notifications, toolbar badge and a keepalive
 * alarm. All listeners are registered synchronously at top level so Chrome can wake the worker
 * for them.
 */
import { KEEPALIVE_ALARM, UI_PORT_NAME } from '../config';
import { api } from '../services/api';
import type { BackgroundToUiMessage, UiToBackgroundMessage } from '../types/messages';
import { onStorageChange } from '../utils/storage';
import { refreshBadge } from './badge';
import { clearPending, PENDING_PREFIX } from './notifications';
import { SocketManager } from './socketManager';

const ports = new Set<chrome.runtime.Port>();

function broadcast(msg: BackgroundToUiMessage): void {
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      ports.delete(port);
    }
  }
}

const manager = new SocketManager(broadcast);

function dashboardUrl(route: string): string {
  return `${chrome.runtime.getURL('dashboard.html')}#${route}`;
}

// --- lifecycle ---------------------------------------------------------------------------------

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(KEEPALIVE_ALARM);
  if (!existing) await chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  manager.ensureConnected();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  manager.ensureConnected();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  manager.ensureConnected();
  void refreshBadge();
});

// Reconnect whenever the service worker wakes up.
void ensureAlarm();
manager.ensureConnected();

// Token reset / API URL override → reconnect with the new credentials or endpoint.
onStorageChange(['apiToken', 'apiUrlOverride'], () => {
  manager.restart();
  void refreshBadge();
});

// --- UI pages ----------------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_PORT_NAME || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.postMessage({ type: 'connection', snapshot: manager.getSnapshot() } satisfies BackgroundToUiMessage);
  manager.ensureConnected();
  port.onMessage.addListener((raw: UiToBackgroundMessage) => {
    switch (raw?.type) {
      case 'reconnect':
        manager.restart();
        break;
      case 'refresh-badge':
        void refreshBadge();
        break;
      case 'get-connection':
        port.postMessage({ type: 'connection', snapshot: manager.getSnapshot() } satisfies BackgroundToUiMessage);
        break;
      default:
        break;
    }
  });
  port.onDisconnect.addListener(() => ports.delete(port));
});

// --- notifications -----------------------------------------------------------------------------

function pendingIdOf(notificationId: string): string | null {
  return notificationId.startsWith(PENDING_PREFIX) ? notificationId.slice(PENDING_PREFIX.length) : null;
}

/** Clicking a notification only opens the confirmation screen — it never executes anything. */
chrome.notifications.onClicked.addListener((notificationId) => {
  const id = pendingIdOf(notificationId);
  void chrome.tabs.create({ url: dashboardUrl(id ? `/confirm/${encodeURIComponent(id)}` : '/') });
  void chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const id = pendingIdOf(notificationId);
  if (!id) return;
  if (buttonIndex === 0) {
    // "Review & Copy": open the confirmation modal. The user confirms there, explicitly.
    void chrome.tabs.create({ url: dashboardUrl(`/confirm/${encodeURIComponent(id)}`) });
    void clearPending(id);
    return;
  }
  // "Skip"
  void (async () => {
    try {
      await api.skip({ copyOrderId: id, reason: 'Skipped from notification' });
    } catch (e) {
      console.warn('[PolyMirror] skip failed', e);
    } finally {
      await clearPending(id);
      await refreshBadge();
    }
  })();
});
