import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';

export async function userRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/system', async () => ({
    mode: ctx.adapter.mode,
    execution: ctx.execution.kind,
    supportsProgrammaticExecution: ctx.execution.supportsProgrammaticExecution,
    version: ctx.config.version,
    serverTime: Date.now(),
  }));

  app.post(
    '/api/users/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_req, reply) => reply.status(201).send(await ctx.users.register()),
  );
}
