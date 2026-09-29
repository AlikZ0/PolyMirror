import type { WsClientMessage, WsServerMessage } from '@polymirror/shared';

/**
 * WebSocket client for the PolyMirror realtime channel.
 *
 * - Authenticates on every open with `{type:'auth', token}`.
 * - Heartbeat: sends `{type:'ping'}` every `heartbeatIntervalMs`; if nothing arrives within
 *   `heartbeatTimeoutMs` the socket is considered dead and is recycled.
 * - Reconnects with exponential backoff + full jitter (1s → 30s cap by default).
 * - After a *re*connect has authenticated it sends `{type:'resync'}` and calls `onResync`, so the
 *   app can refetch `/api/copy/pending`.
 *
 * SAFETY: this class can only ever send `auth`, `ping` and `resync`. It has no public send method
 * and never confirms, skips or otherwise acts on a copy order. Financial actions happen only from
 * explicit user clicks through the REST API.
 */

export type SocketState = 'connecting' | 'open' | 'authenticated' | 'reconnecting' | 'closed';

/** The subset of the WebSocket API we rely on (lets tests inject a fake). */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = new (url: string) => WebSocketLike;

export interface TimerApi {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  now: () => number;
}

export interface ReconnectingSocketOptions {
  /** URL or a (possibly async) resolver, re-evaluated on every connect attempt. */
  url: string | (() => string | Promise<string>);
  /** Returns the current API token; `null` postpones the connection (backoff applies). */
  getToken: () => string | null | Promise<string | null>;
  WebSocketImpl?: WebSocketFactory;
  timers?: Partial<TimerApi>;
  /** Random source in [0,1) used for jitter (injectable for deterministic tests). */
  random?: () => number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  /** Close and retry if the server does not confirm authentication in time. */
  authTimeoutMs?: number;
  onMessage?: (message: WsServerMessage) => void;
  onStateChange?: (state: SocketState, info: SocketStateInfo) => void;
  /** Called after a reconnect has re-authenticated. Must only refetch data — never act on orders. */
  onResync?: () => void;
  /** The server rejected the token (connection.status error). */
  onAuthError?: (message: string | undefined) => void;
}

export interface SocketStateInfo {
  attempt: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

const OPEN = 1;

export class ReconnectingSocket {
  private ws: WebSocketLike | null = null;
  private state: SocketState = 'closed';
  private stopped = true;
  private attempt = 0;
  private hasAuthenticatedBefore = false;
  private reconnectTimer: unknown = null;
  private heartbeatTimer: unknown = null;
  private heartbeatTimeout: unknown = null;
  private authTimer: unknown = null;
  private nextRetryAt: number | null = null;
  private lastError: string | null = null;
  /** Incremented per connect attempt so stale async work / events from old sockets are ignored. */
  private generation = 0;

  private readonly opts: Required<
    Pick<
      ReconnectingSocketOptions,
      | 'initialDelayMs'
      | 'maxDelayMs'
      | 'heartbeatIntervalMs'
      | 'heartbeatTimeoutMs'
      | 'authTimeoutMs'
    >
  >;
  private readonly timers: TimerApi;
  private readonly random: () => number;
  private readonly WS: WebSocketFactory;

  constructor(private readonly options: ReconnectingSocketOptions) {
    this.opts = {
      initialDelayMs: options.initialDelayMs ?? 1_000,
      maxDelayMs: options.maxDelayMs ?? 30_000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 25_000,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 10_000,
      authTimeoutMs: options.authTimeoutMs ?? 10_000,
    };
    this.timers = {
      setTimeout: options.timers?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
      clearTimeout:
        options.timers?.clearTimeout ??
        ((id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>)),
      setInterval: options.timers?.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms)),
      clearInterval:
        options.timers?.clearInterval ??
        ((id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>)),
      now: options.timers?.now ?? (() => Date.now()),
    };
    this.random = options.random ?? Math.random;
    const impl = options.WebSocketImpl ?? (globalThis.WebSocket as unknown as WebSocketFactory);
    if (!impl) throw new Error('No WebSocket implementation available');
    this.WS = impl;
  }

  getState(): SocketState {
    return this.state;
  }

  getInfo(): SocketStateInfo {
    return { attempt: this.attempt, nextRetryAt: this.nextRetryAt, lastError: this.lastError };
  }

  /** Starts (or keeps) the connection. Idempotent: safe to call from alarms/wakeups. */
  connect(): void {
    if (!this.stopped && this.state !== 'closed') return;
    this.stopped = false;
    void this.open();
  }

  /** Forces a fresh connection now (e.g. token or URL changed), resetting the backoff. */
  restart(): void {
    this.stopped = false;
    this.attempt = 0;
    this.clearReconnect();
    this.teardownSocket();
    void this.open();
  }

  /** Stops for good: no reconnects until `connect()` is called again. */
  close(): void {
    this.stopped = true;
    this.clearReconnect();
    this.teardownSocket();
    this.nextRetryAt = null;
    this.setState('closed');
  }

  /** Current backoff delay for a given attempt (1-based): min(cap, initial * 2^(n-1)) with jitter. */
  backoffDelay(attempt: number): number {
    const base = Math.min(
      this.opts.maxDelayMs,
      this.opts.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    // "Equal jitter": half fixed, half random, so delays grow but never synchronize across clients.
    return Math.round(base / 2 + this.random() * (base / 2));
  }

  // ---------------------------------------------------------------------------

  private async open(): Promise<void> {
    const gen = ++this.generation;
    this.setState(this.hasAuthenticatedBefore || this.attempt > 0 ? 'reconnecting' : 'connecting');
    let url: string;
    let token: string | null;
    try {
      url = typeof this.options.url === 'function' ? await this.options.url() : this.options.url;
      token = await this.options.getToken();
    } catch (err) {
      if (gen !== this.generation || this.stopped) return;
      this.lastError = err instanceof Error ? err.message : 'Failed to prepare connection';
      this.scheduleReconnect();
      return;
    }
    if (gen !== this.generation || this.stopped) return;
    if (!token) {
      this.lastError = 'No session token yet';
      this.scheduleReconnect();
      return;
    }

    let ws: WebSocketLike;
    try {
      ws = new this.WS(url);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Invalid WebSocket URL';
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    if (this.state !== 'reconnecting') this.setState('connecting');

    ws.onopen = () => {
      if (gen !== this.generation) return;
      this.setState('open');
      this.#send({ type: 'auth', token: token as string });
      this.authTimer = this.timers.setTimeout(() => {
        if (gen !== this.generation) return;
        this.lastError = 'Authentication timed out';
        this.recycle();
      }, this.opts.authTimeoutMs);
    };
    ws.onmessage = (ev) => {
      if (gen !== this.generation) return;
      this.handleMessage(ev.data);
    };
    ws.onerror = () => {
      if (gen !== this.generation) return;
      this.lastError = 'WebSocket error';
    };
    ws.onclose = (ev) => {
      if (gen !== this.generation) return;
      this.ws = null;
      this.stopHeartbeat();
      this.clearAuthTimer();
      if (ev.reason) this.lastError = ev.reason;
      if (this.stopped) {
        this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleMessage(raw: unknown): void {
    // Any inbound frame proves the connection is alive.
    this.clearHeartbeatTimeout();
    let msg: WsServerMessage;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as WsServerMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.event !== 'string') return;

    if (msg.event === 'connection.status') {
      const data = msg.data as { status?: string; message?: string };
      if (data?.status === 'authenticated' && this.state !== 'authenticated') {
        this.onAuthenticated();
      } else if (data?.status === 'error') {
        this.lastError = data.message ?? 'Authentication failed';
        this.options.onAuthError?.(data.message);
      }
    }
    this.options.onMessage?.(msg);
  }

  private onAuthenticated(): void {
    this.clearAuthTimer();
    const isReconnect = this.hasAuthenticatedBefore;
    this.hasAuthenticatedBefore = true;
    this.attempt = 0;
    this.nextRetryAt = null;
    this.lastError = null;
    this.setState('authenticated');
    this.startHeartbeat();
    if (isReconnect) {
      this.#send({ type: 'resync' });
      this.options.onResync?.();
    }
  }

  /** The only way anything is written to the socket. Restricted to auth/ping/resync by type. */
  #send(msg: WsClientMessage): void {
    if (msg.type !== 'auth' && msg.type !== 'ping' && msg.type !== 'resync') return;
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = this.timers.setInterval(() => {
      this.#send({ type: 'ping', ts: this.timers.now() });
      if (this.heartbeatTimeout === null) {
        this.heartbeatTimeout = this.timers.setTimeout(() => {
          this.heartbeatTimeout = null;
          this.lastError = 'Heartbeat timed out';
          this.recycle();
        }, this.opts.heartbeatTimeoutMs);
      }
    }, this.opts.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) this.timers.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout !== null) this.timers.clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = null;
  }

  private clearAuthTimer(): void {
    if (this.authTimer !== null) this.timers.clearTimeout(this.authTimer);
    this.authTimer = null;
  }

  /** Drops the current socket (dead or unauthenticated) and schedules a reconnect. */
  private recycle(): void {
    this.teardownSocket();
    if (!this.stopped) this.scheduleReconnect();
  }

  private teardownSocket(): void {
    this.generation++;
    this.stopHeartbeat();
    this.clearAuthTimer();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close(1000, 'client closing');
      } catch {
        // ignore
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearReconnect();
    this.attempt += 1;
    const delay = this.backoffDelay(this.attempt);
    this.nextRetryAt = this.timers.now() + delay;
    this.setState('reconnecting');
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setState(state: SocketState): void {
    const changed = state !== this.state;
    this.state = state;
    if (changed || state === 'reconnecting') {
      this.options.onStateChange?.(state, this.getInfo());
    }
  }
}
