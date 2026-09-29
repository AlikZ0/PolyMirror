import { api } from '../services/api';

let inflight: Promise<void> | null = null;

/** Sets the toolbar badge to the number of pending confirmations (fetched from the backend). */
export function refreshBadge(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { items } = await api.pending();
      await setBadgeCount(items.length);
    } catch {
      // Keep the previous badge on failure; the next event/alarm will retry.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function setBadgeCount(count: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' });
}
