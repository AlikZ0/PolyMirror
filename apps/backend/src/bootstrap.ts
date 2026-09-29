import type { AppConfig } from './config';
import { createContext } from './context';
import { createPrisma } from './database/prisma';
import { createServer, registerApp } from './app';

/** Builds the server, starts background jobs, and returns a stop function. */
export async function createApp(config: AppConfig, opts: { startJobs?: boolean } = {}) {
  const app = createServer(config);
  const db = createPrisma(config.databaseUrl);
  await db.$connect();
  const ctx = createContext(config, db, app.log);
  await registerApp(app, ctx);

  let maintenance: NodeJS.Timeout | null = null;
  if (opts.startJobs ?? true) {
    ctx.watcher.start();
    maintenance = setInterval(() => {
      ctx.copyEngine
        .runMaintenance()
        .catch((err: Error) => app.log.warn({ err: err.message }, 'maintenance failed'));
    }, config.maintenanceIntervalMs);
    maintenance.unref();
  }

  const stop = async () => {
    ctx.watcher.stop();
    if (maintenance) clearInterval(maintenance);
    ctx.hub.closeAll();
    await app.close();
    await db.$disconnect();
  };
  return { app, ctx, stop };
}
