import { DEFAULT_API_URL, DEFAULT_WEBSOCKET_URL, stripTrailingSlash, websocketUrlFor } from '../config';
import { getItem, removeItem, setItem } from '../utils/storage';

/**
 * PolyMirror session handling. The API token is a PolyMirror session credential issued by
 * `POST /api/users/register` — it is NOT a wallet key and grants no access to funds.
 */

export async function getApiUrl(): Promise<string> {
  const override = await getItem('apiUrlOverride');
  return override ? stripTrailingSlash(override) : DEFAULT_API_URL;
}

export async function getWebsocketUrl(): Promise<string> {
  const override = await getItem('apiUrlOverride');
  if (override) {
    try {
      return websocketUrlFor(override);
    } catch {
      // fall through to the default
    }
  }
  return DEFAULT_WEBSOCKET_URL;
}

let inflight: Promise<string> | null = null;

/** Runs `fn` under a cross-context lock (pages + service worker share an origin). */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks?.request) return locks.request('polymirror-register', fn) as Promise<T>;
  return fn();
}

async function register(): Promise<string> {
  const base = await getApiUrl();
  const res = await fetch(`${base}/api/users/register`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Registration failed (HTTP ${res.status})`);
  const data = (await res.json()) as { userId: string; apiToken: string };
  if (!data?.apiToken) throw new Error('Registration returned no token');
  await setItem('apiToken', data.apiToken);
  await setItem('userId', data.userId);
  return data.apiToken;
}

/**
 * Returns the stored token, registering a new anonymous PolyMirror user on first run.
 * Concurrent callers (popup, dashboard, background) share one registration.
 */
export async function ensureToken(): Promise<string> {
  const existing = await getItem('apiToken');
  if (existing) return existing;
  if (!inflight) {
    inflight = withLock(async () => {
      const again = await getItem('apiToken');
      return again ?? register();
    }).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Non-throwing variant for the websocket (null → try later). */
export async function tryGetToken(): Promise<string | null> {
  try {
    return await ensureToken();
  } catch {
    return null;
  }
}

/**
 * Handles a 401: if the stored token is still the one that failed, discard it and register again.
 * Another context may already have refreshed it — then that newer token is reused.
 */
export async function refreshAfterUnauthorized(failedToken: string | null): Promise<string | null> {
  try {
    return await withLock(async () => {
      const current = await getItem('apiToken');
      if (current && current !== failedToken) return current;
      await removeItem('apiToken');
      return register();
    });
  } catch {
    return null;
  }
}

/** Settings → "Reset session token": forget the token; a new session is created on next use. */
export async function resetSession(): Promise<void> {
  await removeItem('apiToken');
  await removeItem('userId');
}
