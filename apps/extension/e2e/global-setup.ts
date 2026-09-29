import { execSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import { E2E_DIST, EXTENSION_ROOT, MOCK_PORT } from './constants';
import { startMockServer } from './mock-server';

/** Builds the extension against the mock backend and starts the mock. Returns the teardown. */
export default async function globalSetup(_config: FullConfig) {
  if (!process.env.E2E_SKIP_BUILD) {
    const env = {
      ...process.env,
      VITE_API_URL: `http://localhost:${MOCK_PORT}`,
      VITE_WEBSOCKET_URL: `ws://localhost:${MOCK_PORT}/ws`,
    };
    const opts = { cwd: EXTENSION_ROOT, env, stdio: 'inherit' as const };
    execSync(`npx vite build --outDir "${E2E_DIST}" --logLevel warn`, opts);
    execSync(
      `npx vite build -c vite.content.config.ts --outDir "${E2E_DIST}" --logLevel warn`,
      opts,
    );
  }
  const server = await startMockServer(MOCK_PORT);
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
