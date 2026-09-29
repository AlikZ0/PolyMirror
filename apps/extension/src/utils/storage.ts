import { DEFAULT_NOTIFICATION_PREFS, type StorageSchema } from '../types/settings';
import { hasChrome } from './chromeApi';

const DEFAULTS: StorageSchema = {
  apiToken: null,
  userId: null,
  apiUrlOverride: null,
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  assistedOrder: null,
};

const LOCAL_PREFIX = 'polymirror:';

/**
 * Typed access to chrome.storage.local. Falls back to window.localStorage outside the extension
 * (vite dev server, unit tests) so pages still render.
 */
export async function getItem<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]> {
  if (hasChrome() && chrome.storage?.local) {
    const res = await chrome.storage.local.get(key);
    return (res[key] as StorageSchema[K] | undefined) ?? DEFAULTS[key];
  }
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_PREFIX + key);
    return raw === null || raw === undefined
      ? DEFAULTS[key]
      : (JSON.parse(raw) as StorageSchema[K]);
  } catch {
    return DEFAULTS[key];
  }
}

export async function setItem<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  if (hasChrome() && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    globalThis.localStorage?.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: nothing to persist.
  }
}

export async function removeItem(key: keyof StorageSchema): Promise<void> {
  if (hasChrome() && chrome.storage?.local) {
    await chrome.storage.local.remove(key);
    return;
  }
  try {
    globalThis.localStorage?.removeItem(LOCAL_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Subscribes to changes of the given keys. Returns an unsubscribe function. */
export function onStorageChange(
  keys: Array<keyof StorageSchema>,
  listener: (changed: Partial<StorageSchema>) => void,
): () => void {
  if (!hasChrome() || !chrome.storage?.onChanged) return () => undefined;
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    const changed: Partial<StorageSchema> = {};
    let any = false;
    for (const k of keys) {
      if (k in changes) {
        (changed as Record<string, unknown>)[k] = changes[k]?.newValue ?? DEFAULTS[k];
        any = true;
      }
    }
    if (any) listener(changed);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
