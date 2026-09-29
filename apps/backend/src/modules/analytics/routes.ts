import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';

export async function analyticsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/statistics', async (req) => ctx.statistics.forUser(req.userId));
  app.get('/api/dashboard', async (req) => ctx.statistics.dashboard(req.userId, ctx.adapter.mode, ctx.notifications));
}
