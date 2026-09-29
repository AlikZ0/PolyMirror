import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { E2E_DIST } from './constants';

/**
 * The pinned @playwright/test may expect a different Chromium revision than the one installed in
 * PLAYWRIGHT_BROWSERS_PATH, so we locate a full Chromium binary ourselves (the headless shell
 * cannot load extensions).
 */
function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const candidate = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, provide) => {
    const context = await chromium.launchPersistentContext('', {
      headless: true, // new headless mode supports extensions
      executablePath: findChromium(),
      args: [`--disable-extensions-except=${E2E_DIST}`, `--load-extension=${E2E_DIST}`],
    });
    await provide(context);
    await context.close();
  },
  extensionId: async ({ context }, provide) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await provide(id);
  },
});

export const expect = test.expect;
