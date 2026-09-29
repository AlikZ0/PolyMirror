import {
  analyticsQuerySchema,
  evmAddressSchema,
  historicalTradesQuerySchema,
  scannerFiltersSchema,
} from '@polymirror/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context';

const addressParams = z.object({ address: evmAddressSchema });

export async function traderRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/traders', async (req) =>
    ctx.traders.scan(req.userId, scannerFiltersSchema.parse(req.query)),
  );

  app.get('/api/traders/:address', async (req) => {
    const { address } = addressParams.parse(req.params);
    const profile = await ctx.traders.profile(req.userId, address);
    if (profile.isWatched) await ctx.watchlist.markSeen(req.userId, address);
    return profile;
  });

  app.get('/api/traders/:address/trades', async (req) => {
    const { address } = addressParams.parse(req.params);
    return ctx.traders.trades(address, historicalTradesQuerySchema.parse(req.query));
  });

  app.get('/api/traders/:address/analytics', async (req) => {
    const { address } = addressParams.parse(req.params);
    return ctx.traders.analytics(address, analyticsQuerySchema.parse(req.query).period);
  });

  app.get('/api/traders/:address/performance', async (req) => {
    const { address } = addressParams.parse(req.params);
    return ctx.traders.performance(req.userId, address);
  });
}
