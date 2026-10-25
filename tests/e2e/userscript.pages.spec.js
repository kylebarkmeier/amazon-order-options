import { test, expect } from '@playwright/test';
import { AMAZON, badgeTitles, injectUserscript, routeAmazon } from './helpers.js';

/**
 * Runs the Tampermonkey build in plain Chromium, Firefox, WebKit and an
 * emulated phone. The script is injected after load, which is what a
 * userscript manager does with @run-at document-idle.
 */
test.describe('userscript', () => {
  let requestLog;

  test.beforeEach(async ({ page }) => {
    requestLog = await routeAmazon(page);
  });

  test('return cart', async ({ page }) => {
    await page.goto(`${AMAZON}/spr/returns/cart?itemId=jnmbodywashaaaa&orderId=111-2222222-3333333`);
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(await badgeTitles(page)).toEqual(['Size: 9.30 Fl Oz (Pack of 1)', 'Size: M · Color: Pink', 'Size: L · Color: Pink']);
    const titles = page.locator('#items-expanded-section .a-size-base.a-text-bold');
    await expect(titles.nth(1)).toHaveText("Care Bears Cheer Bear Romper Women's Costume - M");
    await expect(titles.nth(2)).toHaveText("Care Bears Cheer Bear Romper Women's Costume - L");
  });

  test('return status page', async ({ page }) => {
    await page.goto(`${AMAZON}/spr/returns/prep?orderId=111-2222222-3333333`);
    await injectUserscript(page);
    const badge = page.locator('.aoo-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Size: 9 Women/8.5 Men · Color: Green');
    await expect(badge).toHaveAttribute('data-aoo-source', 'page');
  });

  test('order details', async ({ page }) => {
    await page.goto(`${AMAZON}/your-orders/order-details?orderID=111-2222222-3333333`);
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(await badgeTitles(page)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink', 'Size: 9.30 Fl Oz (Pack of 1)']);
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toHaveLength(3);
    await expect(page.locator('.aoo-badge').first()).toHaveAttribute('data-aoo-source', 'product');
  });

  test('orders list', async ({ page }) => {
    await page.goto(`${AMAZON}/gp/css/order-history`);
    await injectUserscript(page);
    await expect(page.locator('[data-aoo-state="done"]')).toHaveCount(2);
    await expect(page.locator('[data-aoo-state="none"]')).toHaveCount(1);
  });

  test('your returns', async ({ page }) => {
    await page.goto(`${AMAZON}/your-returns`);
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(2);
  });

  test('caches product data in storage between loads', async ({ page }) => {
    await page.goto(`${AMAZON}/your-orders/order-details?orderID=111-2222222-3333333`);
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toHaveLength(3);

    await page.reload();
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toHaveLength(3);
  });

  test('items added later are picked up', async ({ page }) => {
    await page.goto(`${AMAZON}/spr/returns/prep?orderId=111-2222222-3333333`);
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(1);
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'a-box';
      box.innerHTML = `
        <div class="a-box-inner a-padding-base">
          <div class="a-row a-grid-vertical-align a-grid-center">
            <div class="a-column a-span3"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS160_.jpg"></div>
            <div class="a-column a-span9"><a href="/dp/B0ROMPRMED">Care Bears Cheer Bear Romper Women's Costume - M</a></div>
          </div>
        </div>`;
      document.getElementById('a-page').appendChild(box);
    });
    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    await expect(page.locator('.aoo-badge').nth(1)).toHaveAttribute('title', 'Size: M · Color: Pink');
  });

  test('badges fit the viewport without horizontal scrolling', async ({ page }) => {
    const measureOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto(`${AMAZON}/spr/returns/cart?itemId=jnmbodywashaaaa&orderId=111-2222222-3333333`);
    // Amazon's own layout may already overflow by a pixel; the badges must not add to it.
    const before = await measureOverflow();
    await injectUserscript(page);
    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(await measureOverflow()).toBeLessThanOrEqual(Math.max(before, 0));
    const box = await page.locator('.aoo-badge').first().boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test('stays idle on pages it does not handle', async ({ page }) => {
    await page.goto(`${AMAZON}/dp/B0ROMPRMED`);
    await injectUserscript(page);
    await page.waitForTimeout(500);
    await expect(page.locator('.aoo-badge')).toHaveCount(0);
    await expect(page.locator('#aoo-styles')).toHaveCount(0);
  });
});
