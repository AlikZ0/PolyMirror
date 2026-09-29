/**
 * Seeds the database with DEMO data: demo traders/markets and a demo user that follows three
 * traders. Prints the demo user's session token so it can be pasted into the extension settings.
 * Only intended for DATA_MODE=demo — never seeds real credentials.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_COPY_SETTINGS } from '@polymirror/shared';
import { DemoPolymarketAdapter } from '../src/adapters/polymarket/demo/demoAdapter';
import { UserService } from '../src/modules/users/service';

async function main() {
  if ((process.env.DATA_MODE ?? 'demo') !== 'demo') {
    throw new Error('db:seed only seeds DEMO data. Set DATA_MODE=demo.');
  }
  const db = new PrismaClient();
  const adapter = new DemoPolymarketAdapter();
  const world = adapter.world;

  for (const m of world.markets) {
    const data = {
      question: m.question,
      slug: m.slug,
      eventSlug: m.eventSlug,
      category: m.category,
      active: true,
      closed: false,
      outcomes: m.outcomes,
      tokenIds: m.tokenIds,
      outcomePrices: [],
    };
    await db.market.upsert({ where: { conditionId: m.conditionId }, create: { conditionId: m.conditionId, ...data }, update: data });
  }

  const traders = [];
  for (const t of world.traders) {
    traders.push(
      await db.trader.upsert({
        where: { address: t.address },
        create: { address: t.address, userName: t.userName, lastPolledAt: new Date() },
        update: { userName: t.userName },
      }),
    );
  }

  const users = new UserService(db);
  const { userId, apiToken } = await users.register();
  await db.copySettings.create({ data: { userId, ...DEFAULT_COPY_SETTINGS } });
  for (const t of traders.slice(0, 3)) {
    await db.watchlist.create({ data: { userId, traderId: t.id } });
  }

  console.info(`Seeded ${world.markets.length} demo markets and ${traders.length} demo traders.`);
  console.info(`Demo user ${userId} follows 3 traders.`);
  console.info(`Demo session token (paste in extension Settings → Session token): ${apiToken}`);
  console.info('Demo trader addresses are stable; their generated history is anchored to the backend start time.');
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
