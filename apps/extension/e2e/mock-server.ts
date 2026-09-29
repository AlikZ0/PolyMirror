/**
 * Tiny mock of the PolyMirror backend for e2e tests: REST fixtures + a minimal WebSocket
 * endpoint (RFC 6455 text frames, implemented with node:crypto — no dependencies).
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import * as data from './mock-data';

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

function route(req: IncomingMessage, res: ServerResponse, body: unknown) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname;
  const m = req.method ?? 'GET';
  if (m === 'OPTIONS') return send(res, 204, undefined);

  if (m === 'GET' && p === '/api/system') return send(res, 200, data.system());
  if (m === 'POST' && p === '/api/users/register') return send(res, 200, { userId: 'user-1', apiToken: 'mock-token' });

  if (!(req.headers.authorization ?? '').startsWith('Bearer ')) {
    return send(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
  }

  if (m === 'GET' && p === '/api/dashboard') return send(res, 200, data.dashboard());
  if (m === 'GET' && p === '/api/traders')
    return send(res, 200, { items: data.traders(), generatedAt: Date.now(), source: 'mock' });
  let match = p.match(/^\/api\/traders\/([^/]+)(?:\/(trades|analytics|performance))?$/);
  if (m === 'GET' && match) {
    const address = decodeURIComponent(match[1]!);
    if (match[2] === 'trades') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
      const all = data.trades();
      return send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
    }
    if (match[2] === 'analytics') return send(res, 200, data.analytics(address));
    if (match[2] === 'performance') return send(res, 200, data.performance(address));
    return send(res, 200, data.profile(address));
  }
  if (m === 'GET' && p === '/api/watchlist')
    return send(res, 200, {
      items: [
        {
          id: 'w-1',
          traderAddress: data.WHALE,
          userName: 'BigWhale',
          status: 'ACTIVE',
          lastTradeAt: Date.now() - 3_600_000,
          totalVolume: 4_250_000,
          pnl: 312_000,
          roi: 0.073,
          newTrades: 2,
          createdAt: Date.now() - 86_400_000,
        },
      ],
    });
  if (m === 'GET' && p === '/api/copy/settings') return send(res, 200, data.copySettings());
  if (m === 'PUT' && p === '/api/copy/settings') return send(res, 200, { ...(body as object), updatedAt: Date.now() });
  if (m === 'GET' && p === '/api/copy/pending') return send(res, 200, { items: [data.pendingItem()] });
  if (m === 'POST' && p === '/api/copy/confirm') {
    const b = body as { confirm?: unknown; expectedAmount?: unknown; copyOrderId?: string };
    if (b?.confirm !== true || b.expectedAmount !== 10) {
      return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'Explicit confirmation required' } });
    }
    const { order } = data.pendingItem();
    return send(res, 200, { order: { ...order, status: 'CONFIRMED', executedAt: Date.now(), fillPrice: 0.63 } });
  }
  if (m === 'POST' && p === '/api/copy/skip') {
    const { order } = data.pendingItem();
    return send(res, 200, { order: { ...order, status: 'SKIPPED' } });
  }
  if (m === 'GET' && p === '/api/copy/history') {
    const { order } = data.pendingItem();
    const items = [
      { ...order, id: 'h-1', status: 'CONFIRMED', pnl: 1.2 },
      { ...order, id: 'h-2', status: 'FAILED', failureReason: 'Price moved beyond max slippage' },
      { ...order, id: 'h-3', status: 'SKIPPED' },
    ];
    return send(res, 200, { items, total: items.length, page: 1, pageSize: 25 });
  }
  if (m === 'GET' && p === '/api/statistics') return send(res, 200, data.statistics());
  if (m === 'GET' && p === '/api/notifications') return send(res, 200, { items: data.dashboard().recentEvents, unread: 1 });
  if (m === 'POST' && p === '/api/notifications/read') return send(res, 200, { ok: true });
  match = p.match(/^\/api\/watchlist(?:\/([^/]+))?$/);
  if (match && m !== 'GET') return send(res, 200, m === 'DELETE' ? { ok: true } : { id: 'w-1', status: 'ACTIVE' });

  return send(res, 404, { error: { code: 'NOT_FOUND', message: `No mock for ${m} ${p}` } });
}

// --- minimal WebSocket ---------------------------------------------------------------------------

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const header = len < 126 ? Buffer.from([0x81, len]) : Buffer.from([0x81, 126, len >> 8, len & 0xff]);
  return Buffer.concat([header, payload]);
}

function parseFrames(buf: Buffer): { messages: Array<{ opcode: number; text: string }>; rest: Buffer } {
  const messages: Array<{ opcode: number; text: string }> = [];
  let offset = 0;
  while (buf.length - offset >= 6) {
    const opcode = buf[offset]! & 0x0f;
    let len = buf[offset + 1]! & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      len = buf.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      len = Number(buf.readBigUInt64BE(pos));
      pos += 8;
    }
    if (buf.length < pos + 4 + len) break;
    const mask = buf.subarray(pos, pos + 4);
    pos += 4;
    const payload = Buffer.from(buf.subarray(pos, pos + len));
    for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
    messages.push({ opcode, text: payload.toString('utf8') });
    offset = pos + len;
  }
  return { messages, rest: buf.subarray(offset) };
}

let seq = 0;
const envelope = (event: string, d: unknown) => JSON.stringify({ event, data: d, seq: ++seq, ts: Date.now() });

function handleUpgrade(req: IncomingMessage, socket: Duplex) {
  const key = req.headers['sec-websocket-key'];
  if (!key || new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    const parsed = parseFrames(Buffer.concat([buffer, chunk]));
    buffer = Buffer.from(parsed.rest);
    for (const msg of parsed.messages) {
      if (msg.opcode === 0x8) {
        socket.end(Buffer.from([0x88, 0]));
        return;
      }
      if (msg.opcode !== 0x1) continue;
      let parsedMsg: { type?: string; token?: string };
      try {
        parsedMsg = JSON.parse(msg.text) as { type?: string; token?: string };
      } catch {
        continue;
      }
      if (parsedMsg.type === 'auth' || parsedMsg.type === 'ping') {
        socket.write(frame(envelope('connection.status', { status: 'authenticated', serverTime: Date.now() })));
      }
    }
  });
  socket.on('error', () => socket.destroy());
}

export function startMockServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    readBody(req)
      .then((body) => route(req, res, body))
      .catch(() => send(res, 400, { error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }));
  });
  server.on('upgrade', handleUpgrade);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
