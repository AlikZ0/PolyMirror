/**
 * End-to-end API test against a real PostgreSQL (DATABASE_URL, migrations applied).
 * Skipped automatically when the database is not reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DemoPolymarketAdapter } from '../adapters/polymarket/demo/demoAdapter';
import { createServer, registerApp } from '../app';
import { loadConfig } from '../config';
import { createContext } from '../context';
import type { AppContext } from '../context';
import { createPrisma } from '../database/prisma';

const url = process.env.DATABASE_URL;
let reachable = false;
if (url) {
  const probe = createPrisma(url);
  reachable = await probe.$queryRaw`SELECT 1 FROM "User" LIMIT 1`
    .then(() => true)
    .catch(() => false);
  await probe.$disconnect();
}

describe.skipIf(!reachable)('API integration (PostgreSQL)', () => {
  const config = loadConfig({
    ...process.env,
    DATA_MODE: 'demo',
    LOG_LEVEL: 'silent',
    APP_ENV: 'test',
  });
  const db = createPrisma(config.databaseUrl);
  let clock = Date.now();
  const adapter = new DemoPolymarketAdapter(() => clock, clock);
  const app = createServer(config);
  let ctx: AppContext;
  let auth: Record<string, string>;

  beforeAll(async () => {
    ctx = createContext(config, db, app.log, adapter);
    await registerApp(app, ctx);
    const res = await app.inject({ method: 'POST', url: '/api/users/register' });
    expect(res.statusCode).toBe(201);
    auth = { authorization: `Bearer ${res.json().apiToken}` };
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/watchlist' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('validates input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/traders/not-an-address',
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/copy/settings',
      headers: auth,
      payload: { mode: 'MANUAL' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('runs the full follow → propose → confirm flow exactly once per trade', async () => {
    const scan = await app.inject({
      method: 'GET',
      url: '/api/traders?period=30d&limit=5',
      headers: auth,
    });
    expect(scan.statusCode).toBe(200);
    expect(scan.json().items.length).toBeGreaterThan(0);

    // Follow the most active demo trader.
    const trader = [...adapter.world.traders].sort((a, b) => b.liveRate - a.liveRate)[0]!;
    const follow = await app.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: auth,
      payload: { traderAddress: trader.address },
    });
    expect(follow.statusCode).toBe(201);

    // Advance the demo clock until the trader makes a fresh trade.
    let pending: Array<{ order: { id: string; amount: number; whaleSize: number } }> = [];
    for (let i = 0; i < 80 && pending.length === 0; i++) {
      clock += 45_000;
      await ctx.watcher.tick(clock);
      pending = (
        await app.inject({ method: 'GET', url: '/api/copy/pending', headers: auth })
      ).json().items;
    }
    expect(pending.length).toBeGreaterThan(0);
    const { order } = pending[0]!;
    expect(order.amount).toBe(10);
    expect(order.whaleSize).toBeGreaterThan(10_000);

    // Re-polling the same window never creates duplicates.
    const before = await db.copyOrder.count();
    await ctx.watcher.tick(clock);
    expect(await db.copyOrder.count()).toBe(before);

    const confirmBody = {
      copyOrderId: order.id,
      confirm: true,
      expectedAmount: 10,
      idempotencyKey: `it-${order.id}`,
    };
    const confirmed = await app.inject({
      method: 'POST',
      url: '/api/copy/confirm',
      headers: auth,
      payload: confirmBody,
    });
    expect(confirmed.statusCode).toBe(200);
    expect(['CONFIRMED', 'FAILED']).toContain(confirmed.json().order.status);
    expect(confirmed.json().order).not.toHaveProperty('confirmIdempotencyKey');

    const replay = await app.inject({
      method: 'POST',
      url: '/api/copy/confirm',
      headers: auth,
      payload: confirmBody,
    });
    expect(replay.json().order.id).toBe(order.id);
    const again = await app.inject({
      method: 'POST',
      url: '/api/copy/confirm',
      headers: auth,
      payload: { ...confirmBody, idempotencyKey: `other-${order.id}` },
    });
    expect(again.statusCode).toBe(409);

    const history = await app.inject({ method: 'GET', url: '/api/copy/history', headers: auth });
    expect(history.json().total).toBeGreaterThan(0);
    const stats = await app.inject({ method: 'GET', url: '/api/statistics', headers: auth });
    expect(stats.statusCode).toBe(200);
    const audit = await db.auditLog.count({
      where: { entityId: order.id, action: 'copy.confirm' },
    });
    expect(audit).toBe(1);
  }, 60_000);

  it('never stores wallet secrets', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/copy/settings',
      headers: auth,
      payload: {
        mode: 'MANUAL',
        sizingMode: 'FIXED',
        fixedAmount: 10,
        percentage: 0.01,
        minCopyAmount: 1,
        maxPerTrade: 20,
        maxDailyAmount: 100,
        maxOpenPositions: 5,
        minWhaleTrade: 10000,
        maxSlippage: 0.03,
        minBalance: 0,
        confirmationRequired: true,
        allowedCategories: [],
        excludedMarkets: [],
        walletAddress: '0x' + 'ab'.repeat(32), // a 32-byte private-key-shaped value is rejected
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
