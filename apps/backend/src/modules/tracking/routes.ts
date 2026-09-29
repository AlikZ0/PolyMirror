import { watchlistCreateSchema, watchlistUpdateSchema } from '@polymirror/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context';

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function trackingRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/watchlist', async (req) => ({ items: await ctx.watchlist.list(req.userId) }));

  app.post('/api/watchlist', async (req, reply) => {
    const { traderAddress } = watchlistCreateSchema.parse(req.body);
    return reply.status(201).send(await ctx.watchlist.add(req.userId, traderAddress));
  });

  app.patch('/api/watchlist/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return ctx.watchlist.setStatus(req.userId, id, watchlistUpdateSchema.parse(req.body).status);
  });

  app.delete('/api/watchlist/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    await ctx.watchlist.remove(req.userId, id);
    return { ok: true as const };
  });
}
