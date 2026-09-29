import type { WsClientMessage } from '@polymirror/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

const AUTH_TIMEOUT_MS = 10_000;
const MAX_MESSAGE_BYTES = 4_096;

/**
 * WebSocket endpoint. The first message must be `{type:"auth", token}`; the token is never put
 * in the URL (URLs end up in logs). Clients only send auth / ping / resync — no actions.
 */
export async function websocketRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    let userId: string | null = null;
    const authTimer = setTimeout(() => {
      if (!userId) socket.close(4401, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('message', async (raw: Buffer) => {
      if (raw.length > MAX_MESSAGE_BYTES) return socket.close(1009, 'Message too large');
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString('utf8')) as WsClientMessage;
      } catch {
        return socket.close(1003, 'Invalid JSON');
      }
      if (!userId) {
        if (msg.type !== 'auth') return socket.close(4401, 'Authenticate first');
        const id = await ctx.users.authenticate(msg.token).catch(() => null);
        if (!id) {
          ctx.hub.send(socket, 'connection.status', { status: 'error', message: 'Invalid session token', serverTime: Date.now() });
          return socket.close(4401, 'Invalid token');
        }
        userId = id;
        clearTimeout(authTimer);
        ctx.hub.add(id, socket);
        ctx.hub.send(socket, 'connection.status', { status: 'authenticated', serverTime: Date.now() });
        return;
      }
      if (msg.type === 'ping' || msg.type === 'resync') {
        ctx.hub.send(socket, 'connection.status', { status: 'authenticated', serverTime: Date.now() });
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (userId) ctx.hub.remove(userId, socket);
    });
    socket.on('error', (err: Error) => req.log.warn({ err: err.message }, 'websocket error'));
  });
}
