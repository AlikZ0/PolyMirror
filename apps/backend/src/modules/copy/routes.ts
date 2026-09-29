import {
  assistedFillReportSchema,
  copyConfirmSchema,
  copyHistoryQuerySchema,
  copyPreviewSchema,
  copySkipSchema,
} from '@polymirror/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { toCopyOrder } from '../../database/mappers';
import { publicOrder } from './types';

export async function copyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/copy/settings', async (req) => ctx.copySettings.get(req.userId));

  app.put('/api/copy/settings', async (req) => ctx.copySettings.update(req.userId, req.body));

  app.get('/api/copy/pending', async (req) => {
    const pending = await ctx.copyStore.listPending(req.userId);
    const items = [];
    for (const order of pending) {
      items.push({ order: publicOrder(order), preview: await ctx.copyEngine.preview(req.userId, { copyOrderId: order.id }) });
    }
    return { items };
  });

  app.post('/api/copy/preview', async (req) => {
    const body = copyPreviewSchema.parse(req.body);
    const existing = await ctx.db.copyOrder.findUnique({
      where: { userId_sourceTradeId: { userId: req.userId, sourceTradeId: body.sourceTradeId } },
      select: { id: true },
    });
    return ctx.copyEngine.preview(req.userId, existing ? { copyOrderId: existing.id } : { sourceTradeId: body.sourceTradeId });
  });

  app.post('/api/copy/confirm', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = copyConfirmSchema.parse(req.body);
    return { order: publicOrder(await ctx.copyEngine.confirm(req.userId, body)) };
  });

  app.post('/api/copy/skip', async (req) => {
    const body = copySkipSchema.parse(req.body);
    return { order: publicOrder(await ctx.copyEngine.skip(req.userId, body.copyOrderId, body.reason)) };
  });

  app.post('/api/copy/verify', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = assistedFillReportSchema.parse(req.body);
    return { order: publicOrder(await ctx.copyEngine.verify(req.userId, body.copyOrderId)) };
  });

  app.get('/api/copy/history', async (req) => {
    const q = copyHistoryQuerySchema.parse(req.query);
    const where = {
      userId: req.userId,
      ...(q.status !== 'ALL' ? { status: q.status } : {}),
      ...(q.traderAddress ? { trader: { address: q.traderAddress } } : {}),
    };
    const [rows, total] = await Promise.all([
      ctx.db.copyOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { trader: { select: { address: true } } },
      }),
      ctx.db.copyOrder.count({ where }),
    ]);
    return {
      items: rows.map((r) => publicOrder(toCopyOrder(r))),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}
