import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectingSocket, type WebSocketLike } from './reconnectingSocket';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // --- test helpers ---
  serverOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(event: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ event, data, seq: 1, ts: Date.now() }) });
  }
  serverAuthenticate() {
    this.serverSend('connection.status', { status: 'authenticated', serverTime: Date.now() });
  }
  serverClose(reason = '') {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason });
  }
  get messages() {
    return this.sent.map((s) => JSON.parse(s) as { type: string });
  }
}

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

function makeSocket(overrides: Partial<ConstructorParameters<typeof ReconnectingSocket>[0]> = {}) {
  return new ReconnectingSocket({
    url: 'ws://test/ws',
    getToken: () => 'tok-123',
    WebSocketImpl: FakeWebSocket,
    random: () => 1, // jitter → deterministic upper bound (= base delay)
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    heartbeatIntervalMs: 25_000,
    heartbeatTimeoutMs: 10_000,
    ...overrides,
  });
}

describe('ReconnectingSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends auth with the token on open and becomes authenticated', async () => {
    const states: string[] = [];
    const s = makeSocket({ onStateChange: (st) => states.push(st) });
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    latest().serverOpen();
    expect(latest().messages).toEqual([{ type: 'auth', token: 'tok-123' }]);
    latest().serverAuthenticate();
    expect(s.getState()).toBe('authenticated');
    expect(states).toEqual(['connecting', 'open', 'authenticated']);
    s.close();
  });

  it('reconnects with exponential backoff after the connection closes', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverClose();
    expect(s.getState()).toBe('reconnecting');

    // attempt 1 → 1s
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // attempt 2 → 2s
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // attempt 3 → 4s
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(FakeWebSocket.instances).toHaveLength(4);
    s.close();
  });

  it('caps the backoff delay and applies jitter', () => {
    const s = makeSocket({ random: () => 0 });
    expect(s.backoffDelay(1)).toBe(500);
    expect(s.backoffDelay(3)).toBe(2_000);
    expect(s.backoffDelay(20)).toBe(15_000);
    const s2 = makeSocket({ random: () => 1 });
    expect(s2.backoffDelay(20)).toBe(30_000);
  });

  it('resets the backoff after a successful authentication', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(2_000);
    latest().serverOpen();
    latest().serverAuthenticate();
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(1_000); // back to the initial delay
    expect(FakeWebSocket.instances).toHaveLength(4);
    s.close();
  });

  it('calls onResync (and sends resync) only after a reconnect, never on the first connection', async () => {
    const onResync = vi.fn();
    const s = makeSocket({ onResync });
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverAuthenticate();
    expect(onResync).not.toHaveBeenCalled();

    latest().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    latest().serverOpen();
    expect(onResync).not.toHaveBeenCalled(); // not before re-authentication
    latest().serverAuthenticate();
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(latest().messages).toEqual([{ type: 'auth', token: 'tok-123' }, { type: 'resync' }]);
    s.close();
  });

  it('stops reconnecting after close()', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverAuthenticate();
    const ws = latest();
    s.close();
    expect(ws.closed).toBe(true);
    expect(s.getState()).toBe('closed');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('closes a pending reconnect timer on close()', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverClose();
    s.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('sends heartbeat pings and recycles the socket when they time out', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverAuthenticate();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(latest().messages.map((m) => m.type)).toEqual(['auth', 'ping']);
    // No answer within the heartbeat timeout → dead connection → reconnect.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(s.getState()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    s.close();
  });

  it('keeps the connection when the server answers pings', async () => {
    const s = makeSocket();
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverAuthenticate();
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(25_000);
      latest().serverSend('connection.status', { status: 'authenticated', serverTime: 1 });
    }
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(s.getState()).toBe('authenticated');
    s.close();
  });

  it('never sends anything but auth, ping and resync — even when copy events arrive', async () => {
    const onMessage = vi.fn();
    const s = makeSocket({ onMessage, onResync: () => undefined });
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverAuthenticate();
    latest().serverSend('copy.pending', { order: { id: 'o1' }, preview: { amount: 10 } });
    latest().serverSend('copy.success', { order: { id: 'o1' } });
    await vi.advanceTimersByTimeAsync(25_000);
    latest().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    latest().serverOpen();
    latest().serverAuthenticate();
    latest().serverSend('copy.pending', { order: { id: 'o2' }, preview: { amount: 10 } });

    const allTypes = FakeWebSocket.instances.flatMap((ws) => ws.messages.map((m) => m.type));
    expect(new Set(allTypes)).toEqual(new Set(['auth', 'ping', 'resync']));
    expect(onMessage).toHaveBeenCalled();
    expect(s).not.toHaveProperty('send', expect.any(Function)); // private, not part of the API
    s.close();
  });

  it('waits and retries when no token is available yet', async () => {
    let token: string | null = null;
    const s = makeSocket({ getToken: () => token });
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(s.getState()).toBe('reconnecting');
    token = 'late';
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    latest().serverOpen();
    expect(latest().messages).toEqual([{ type: 'auth', token: 'late' }]);
    s.close();
  });

  it('reports server auth errors', async () => {
    const onAuthError = vi.fn();
    const s = makeSocket({ onAuthError });
    s.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().serverOpen();
    latest().serverSend('connection.status', { status: 'error', message: 'bad token', serverTime: 1 });
    expect(onAuthError).toHaveBeenCalledWith('bad token');
    expect(s.getState()).toBe('open');
    s.close();
  });
});
