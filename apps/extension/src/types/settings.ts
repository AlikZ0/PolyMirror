/** Per-type desktop notification preferences, stored in chrome.storage.local. */
export interface NotificationPrefs {
  whaleTrade: boolean;
  copySuccess: boolean;
  copyFailed: boolean;
  dailyLimit: boolean;
  connectionLost: boolean;
  traderStatus: boolean;
  other: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  whaleTrade: true,
  copySuccess: true,
  copyFailed: true,
  dailyLimit: true,
  connectionLost: true,
  traderStatus: false,
  other: true,
};

/**
 * Prepared order details handed to the polymarket.com content script (display only).
 * Contains no secrets and triggers no action on the page.
 */
export interface AssistedOrderHint {
  copyOrderId: string;
  marketTitle: string | null;
  marketUrl: string | null;
  outcome: string | null;
  side: 'BUY' | 'SELL';
  amount: number;
  estimatedShares: number;
  price: number | null;
  createdAt: number;
  expiresAt: number;
}

/** Everything the extension keeps in chrome.storage.local. */
export interface StorageSchema {
  apiToken: string | null;
  userId: string | null;
  apiUrlOverride: string | null;
  notificationPrefs: NotificationPrefs;
  assistedOrder: AssistedOrderHint | null;
}
