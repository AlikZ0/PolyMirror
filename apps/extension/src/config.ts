/** Build-time defaults. The API URL can be overridden at runtime from Settings. */
export const DEFAULT_API_URL = stripTrailingSlash(
  import.meta.env.VITE_API_URL || 'http://localhost:4000',
);
export const DEFAULT_WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:4000/ws';

export const REQUEST_TIMEOUT_MS = 15_000;
export const UI_PORT_NAME = 'polymirror-ui';
export const KEEPALIVE_ALARM = 'polymirror-keepalive';

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Derives the WebSocket URL for an overridden API URL (http→ws, https→wss, path /ws). */
export function websocketUrlFor(apiUrl: string): string {
  const u = new URL(apiUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/ws`;
  u.search = '';
  u.hash = '';
  return u.toString();
}
