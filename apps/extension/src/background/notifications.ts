import {
  formatUsd,
  shortAddress,
  type CopyOrder,
  type CopyPreview,
  type NotificationItem,
} from '@polymirror/shared';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../types/settings';
import { getItem } from '../utils/storage';

const ICON = 'icons/icon-128.png';
export const PENDING_PREFIX = 'pending:';
const CONNECTION_ID = 'connection-lost';

async function prefs(): Promise<NotificationPrefs> {
  const stored = await getItem('notificationPrefs');
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored };
}

async function create(id: string, options: chrome.notifications.NotificationCreateOptions) {
  try {
    await chrome.notifications.create(id, options);
  } catch (e) {
    console.warn('[PolyMirror] notification failed', e);
  }
}

/**
 * "🐋 New trade detected". The buttons only open the review screen or skip — a notification can
 * never execute a trade.
 */
export async function notifyPending(order: CopyOrder, preview: CopyPreview): Promise<void> {
  if (!(await prefs()).whaleTrade) return;
  // The user's amount always comes from the server-side preview (their settings), never the whale's.
  const yourCopy = formatUsd(preview.amount);
  await create(`${PENDING_PREFIX}${order.id}`, {
    type: 'basic',
    iconUrl: ICON,
    title: '🐋 New trade detected',
    message: [
      `${shortAddress(order.traderAddress)} · ${order.marketTitle ?? 'Unknown market'}`,
      `Position: ${formatUsd(order.whaleSize)}`,
      `Your copy: ${yourCopy}`,
    ].join('\n'),
    buttons: [{ title: `Review & Copy ${yourCopy}` }, { title: 'Skip' }],
    requireInteraction: true,
    priority: 2,
  });
}

export async function clearPending(copyOrderId: string): Promise<void> {
  try {
    await chrome.notifications.clear(`${PENDING_PREFIX}${copyOrderId}`);
  } catch {
    // ignore
  }
}

export async function notifyCopyResult(order: CopyOrder, reason?: string): Promise<void> {
  const p = await prefs();
  await clearPending(order.id);
  if (order.status === 'CONFIRMED') {
    if (!p.copySuccess) return;
    await create(`result:${order.id}`, {
      type: 'basic',
      iconUrl: ICON,
      title: '📈 Trade copied',
      message: `${formatUsd(order.amount)} ${order.side} · ${order.marketTitle ?? 'Unknown market'}`,
      priority: 1,
    });
  } else if (order.status === 'FAILED') {
    if (!p.copyFailed) return;
    await create(`result:${order.id}`, {
      type: 'basic',
      iconUrl: ICON,
      title: '⚠️ Copy failed',
      message: `${order.marketTitle ?? 'Unknown market'}\nReason: ${reason ?? order.failureReason ?? 'Unknown'}`,
      priority: 1,
    });
  }
}

/** Server-originated notifications that are not already covered by copy.* events. */
export async function notifyGeneric(item: NotificationItem): Promise<void> {
  if (item.type === 'WHALE_TRADE' || item.type === 'COPY_SUCCESS' || item.type === 'COPY_FAILED') {
    return; // shown from copy.pending / copy.success / copy.failed
  }
  const p = await prefs();
  const allowed =
    item.type === 'DAILY_LIMIT_REACHED'
      ? p.dailyLimit
      : item.type === 'TRADER_INACTIVE'
        ? p.traderStatus
        : item.type === 'CONNECTION_LOST'
          ? p.connectionLost
          : p.other;
  if (!allowed) return;
  const icon =
    item.type === 'DAILY_LIMIT_REACHED' ? '🛑 ' : item.type === 'COPY_SKIPPED' ? '⏭ ' : '';
  await create(`notif:${item.id}`, {
    type: 'basic',
    iconUrl: ICON,
    title: `${icon}${item.title}`,
    message: item.message,
    priority: 1,
  });
}

export async function notifyConnectionLost(): Promise<void> {
  if (!(await prefs()).connectionLost) return;
  await create(CONNECTION_ID, {
    type: 'basic',
    iconUrl: ICON,
    title: 'PolyMirror connection lost',
    message: 'Retrying… New whale trades will not arrive until the connection is restored.',
    priority: 0,
  });
}

export async function clearConnectionLost(): Promise<void> {
  try {
    await chrome.notifications.clear(CONNECTION_ID);
  } catch {
    // ignore
  }
}
