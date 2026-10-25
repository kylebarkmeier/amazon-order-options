import { test, expect } from './extension-fixtures.js';
import { AMAZON } from './helpers.js';

/**
 * @param {import('@playwright/test').Page} page
 */
async function settled(page) {
  await page.waitForFunction(() => {
    const form = document.getElementById('settings');
    return form && form.dataset.ready === 'true' && !form.dataset.pending;
  });
}

test.describe('options page', () => {
  test('settings persist and change what the content script does', async ({ page, extensionId, context }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.locator('h1')).toHaveText('Amazon Order Options');
    await settled(page);

    const showOnOrders = page.locator('[name="showOnOrders"]');
    await expect(showOnOrders).toBeChecked();
    await showOnOrders.uncheck();
    await expect(page.locator('#status')).toHaveText('Saved.');

    await page.selectOption('[name="badgeStyle"]', 'plain');
    await settled(page);
    await page.reload();
    await settled(page);
    await expect(page.locator('[name="showOnOrders"]')).not.toBeChecked();
    await expect(page.locator('[name="badgeStyle"]')).toHaveValue('plain');
    await expect(page.locator('[name="showOnReturns"]')).toBeChecked();

    const orders = await context.newPage();
    await orders.goto(`${AMAZON}/gp/css/order-history`);
    await orders.waitForTimeout(800);
    await expect(orders.locator('.aoo-badge')).toHaveCount(0);

    const returns = await context.newPage();
    await returns.goto(`${AMAZON}/spr/returns/prep?orderId=111-2222222-3333333`);
    await expect(returns.locator('.aoo-badge')).toHaveCount(1);
    await expect(returns.locator('.aoo-badge')).toHaveAttribute('data-aoo-style', 'plain');
  });

  test('disabling product fetching falls back to the title and says so', async ({ page, extensionId, context, requestLog }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await settled(page);
    await page.locator('[name="fetchProductPages"]').uncheck();
    await expect(page.locator('#status')).toHaveText('Saved.');
    await settled(page);

    const orders = await context.newPage();
    await orders.goto(`${AMAZON}/gp/css/order-history`);
    await expect(orders.locator('.aoo-badge')).toHaveCount(2);
    await expect(orders.locator('.aoo-badge').first()).toHaveAttribute('data-aoo-source', 'title');
    await expect(orders.locator('.aoo-badge .aoo-source').first()).toHaveText('(from title)');
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toEqual([]);
  });
});
