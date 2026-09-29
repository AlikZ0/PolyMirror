/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend REST base URL, baked in at build time. Default http://localhost:4000 */
  readonly VITE_API_URL?: string;
  /** Backend WebSocket URL, baked in at build time. Default ws://localhost:4000/ws */
  readonly VITE_WEBSOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
