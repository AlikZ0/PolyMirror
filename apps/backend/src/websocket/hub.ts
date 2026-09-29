import type { WsEventName, WsPayloads, WsServerMessage } from '@polymirror/shared';

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

/** Tracks authenticated sockets per user and fans out events. */
export class WsHub {
  private readonly sockets = new Map<string, Set<SocketLike>>();
  private readonly seqs = new WeakMap<SocketLike, number>();

  add(userId: string, socket: SocketLike): void {
    const set = this.sockets.get(userId) ?? new Set();
    set.add(socket);
    this.sockets.set(userId, set);
  }

  remove(userId: string, socket: SocketLike): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  send<E extends WsEventName>(socket: SocketLike, event: E, data: WsPayloads[E]): void {
    if (socket.readyState !== OPEN) return;
    const seq = (this.seqs.get(socket) ?? 0) + 1;
    this.seqs.set(socket, seq);
    const msg: WsServerMessage<E> = { event, data, seq, ts: Date.now() };
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // Socket closing: it will be removed by its close handler.
    }
  }

  emit<E extends WsEventName>(userId: string, event: E, data: WsPayloads[E]): void {
    for (const s of this.sockets.get(userId) ?? []) this.send(s, event, data);
  }

  connectedUsers(): number {
    return this.sockets.size;
  }

  closeAll(): void {
    for (const set of this.sockets.values())
      for (const s of set) s.close(1001, 'Server shutting down');
    this.sockets.clear();
  }
}
