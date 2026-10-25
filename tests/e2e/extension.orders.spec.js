import { test, expect } from './extension-fixtures.js';
import { AMAZON, badgeTitles } from './helpers.js';

test.describe('order pages', () => {
  test('order details shows the selected options for every item', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/your-orders/order-details?orderID=111-2222222-3333333`);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(await badgeTitles(page)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink', 'Size: 9.30 Fl Oz (Pack of 1)']);

    for (const badge of await page.locator('.aoo-badge').all()) {
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute('data-aoo-source', 'product');
    }
    expect(requestLog.filter((p) => p.startsWith('/dp/')).sort()).toEqual(['/dp/B0BODYWSH1', '/dp/B0ROMPRLRG', '/dp/B0ROMPRMED']);
  });

  test('orders list annotates items and leaves items without variations alone', async ({ page }) => {
    await page.goto(`${AMAZON}/gp/css/order-history`);
    await expect(page.locator('[data-aoo-state]')).toHaveCount(3);
    await expect(page.locator('[data-aoo-state="done"]')).toHaveCount(2);
    await expect(page.locator('[data-aoo-state="none"]')).toHaveCount(1);
    expect(await badgeTitles(page)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink']);
    await expect(page.locator('.aoo-badge .aoo-source')).toHaveCount(0);
  });

  test('product data is cached across page loads', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/your-orders/order-details?orderID=111-2222222-3333333`);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    const firstVisit = requestLog.filter((p) => p.startsWith('/dp/')).length;
    expect(firstVisit).toBe(3);

    await page.goto(`${AMAZON}/gp/css/order-history`);
    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    // The orders list reuses two cached products and fetches only the new one.
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toHaveLength(4);
    expect(requestLog.filter((p) => p === '/dp/B0NOTWISTR')).toHaveLength(1);
  });

  test('does nothing on product pages or other sites', async ({ page }) => {
    await page.goto(`${AMAZON}/dp/B0ROMPRMED`);
    await page.waitForTimeout(600);
    await expect(page.locator('.aoo-badge')).toHaveCount(0);
    await expect(page.locator('#aoo-styles')).toHaveCount(0);

    await page.goto('https://example.com/not-amazon');
    await page.waitForTimeout(600);
    await expect(page.locator('.aoo-badge')).toHaveCount(0);
  });
});
