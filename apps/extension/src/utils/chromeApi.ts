/** True when running inside an extension context with the chrome.* APIs available. */
export function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
}

export function extensionUrl(path: string): string {
  return hasChrome() ? chrome.runtime.getURL(path) : `/${path}`;
}

/** Opens (a new tab of) the dashboard at a hash route such as `/confirm/abc`. */
export async function openDashboard(route = '/'): Promise<void> {
  const url = `${extensionUrl('dashboard.html')}#${route}`;
  if (hasChrome() && chrome.tabs?.create) {
    await chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Only ever open Polymarket URLs from backend data in a new tab. */
export function safePolymarketUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'polymarket.com' && !u.hostname.endsWith('.polymarket.com')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
