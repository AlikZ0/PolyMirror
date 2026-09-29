import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context';

const readSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(200).optional() });

export async function notificationRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/notifications', async (req) => ctx.notifications.list(req.userId));
  app.post('/api/notifications/read', async (req) => {
    await ctx.notifications.markRead(req.userId, readSchema.parse(req.body ?? {}).ids);
    return { ok: true as const };
  });
}
