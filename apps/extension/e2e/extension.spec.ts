import { expect, test } from './fixtures';

test.describe('PolyMirror extension', () => {
  test('dashboard → scanner → trader profile → confirmation', async ({ page, extensionId }) => {
    const base = `chrome-extension://${extensionId}/dashboard.html`;
    await page.goto(base);

    // Demo mode is unmissable.
    await expect(page.getByTestId('demo-badge')).toHaveText('DEMO MODE');
    await expect(page.getByText('no real trades are executed')).toBeVisible();

    // Realtime connection via the background service worker.
    await expect(page.getByText('Live', { exact: true })).toBeVisible();

    // Dashboard content.
    await expect(page.getByText('Tracked traders')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pending confirmations' })).toBeVisible();

    // Scanner.
    await page.getByRole('link', { name: 'Scanner' }).click();
    await expect(page.getByTestId('scanner-row')).toHaveCount(2);
    await expect(page.getByText('partial data')).toBeVisible();
    await expect(page.getByTestId('scanner-row').nth(1)).toContainText('N/A');

    // Trader profile.
    await page.getByRole('link', { name: 'BigWhale' }).click();
    await expect(page.getByTestId('trader-title')).toHaveText('BigWhale');
    await expect(page.getByRole('table', { name: 'Historical trades' })).toBeVisible();
    await page.getByRole('tab', { name: 'Analytics' }).click();
    await expect(page.getByText('Average holding time only includes fully closed positions.')).toBeVisible();
    await page.getByRole('tab', { name: 'Charts' }).click();
    await expect(page.getByRole('img', { name: 'Cumulative P/L chart' })).toBeVisible();

    // Confirmation modal for a pending order.
    await page.goto(`${base}#/confirm/order-1`);
    const dialog = page.getByRole('dialog', { name: /NEW WHALE TRADE/ });
    await expect(dialog).toBeVisible();
    const copy = dialog.getByRole('button', { name: 'COPY $10' });
    await expect(copy).toBeVisible();
    await expect(copy).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'SKIP' })).toBeVisible();

    await copy.click();
    await expect(dialog.getByText('Success ✓')).toBeVisible();
  });

  test('popup shows stats and pending confirmations', async ({ page, extensionId }) => {
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByTestId('demo-badge')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pending confirmations' })).toBeVisible();
    await page.getByRole('button', { name: /Review copy of \$10/ }).click();
    await expect(page.getByRole('dialog', { name: /NEW WHALE TRADE/ })).toBeVisible();
  });
});
