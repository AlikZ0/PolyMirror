import { loadConfig } from './config';
import { createApp } from './bootstrap';

async function main() {
  const config = loadConfig();
  const { app, ctx, stop } = await createApp(config);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { mode: ctx.adapter.mode, execution: ctx.execution.kind },
    ctx.adapter.mode === 'demo'
      ? 'PolyMirror backend running in DEMO MODE — generated data, simulated execution only'
      : 'PolyMirror backend running in LIVE MODE — read-only Polymarket data, assisted execution',
  );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
