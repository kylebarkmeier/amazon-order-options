import { test, expect } from './extension-fixtures.js';
import { AMAZON, badgeTitles } from './helpers.js';

test.describe('return pages', () => {
  test('return cart tells two sizes with one image apart and restores every truncated title', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/spr/returns/cart?itemId=jnmbodywashaaaa&orderId=111-2222222-3333333`);

    await expect(page.locator('.aoo-badge')).toHaveCount(3);
    expect(await badgeTitles(page)).toEqual(['Size: 9.30 Fl Oz (Pack of 1)', 'Size: M · Color: Pink', 'Size: L · Color: Pink']);

    // The badge sits directly under the visible title, not inside the hidden popover.
    const romperBadge = page.locator('.aoo-badge').nth(1);
    await expect(romperBadge).toBeVisible();
    await expect(romperBadge.locator('.aoo-value').first()).toHaveText('M');

    // Every truncated title was replaced with the full one from the order page.
    const titles = page.locator('#items-expanded-section .a-size-base.a-text-bold');
    await expect(titles.nth(0)).toHaveText('Mirai Clinical Persimmon Body Wash for Old People Smell, Nonenal Solution, 9.30 Fl Oz');
    await expect(titles.nth(1)).toHaveText("Care Bears Cheer Bear Romper Women's Costume - M");
    await expect(titles.nth(2)).toHaveText("Care Bears Cheer Bear Romper Women's Costume - L");

    // The order page once, then one product page per item.
    expect(requestLog.filter((p) => p.endsWith('/order-details'))).toHaveLength(1);
    expect(requestLog.filter((p) => p.startsWith('/dp/')).sort()).toEqual(['/dp/B0BODYWSH1', '/dp/B0ROMPRLRG', '/dp/B0ROMPRMED']);
  });

  test('return status page hoists hidden size and color and expands the title', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/spr/returns/prep?contractId=x&orderId=111-2222222-3333333`);

    const badge = page.locator('.aoo-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Size: 9 Women/8.5 Men · Color: Green');
    await expect(badge).toHaveAttribute('data-aoo-source', 'page');
    await expect(page.locator('.a-truncate-cut')).toHaveText(/with USB Charging$/);
    // The item is not in the order fixture, so no product page is fetched.
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toEqual([]);
  });

  test('your returns page keeps existing details and adds product data', async ({ page }) => {
    await page.goto(`${AMAZON}/your-returns?ref_=orc`);
    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    expect(await badgeTitles(page)).toEqual(['Size: 9 Women/8.5 Men · Color: Green', 'Size: M · Color: Pink']);
  });

  test('items added later by the single-page return flow are picked up', async ({ page }) => {
    await page.goto(`${AMAZON}/spr/returns/prep?orderId=111-2222222-3333333`);
    await expect(page.locator('.aoo-badge')).toHaveCount(1);

    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'a-box';
      box.innerHTML = `
        <div class="a-box-inner a-padding-base">
          <div class="a-row a-grid-vertical-align a-grid-center">
            <div class="a-column a-span3"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS160_.jpg"></div>
            <div class="a-column a-span9"><a href="/dp/B0ROMPRLRG">Care Bears Cheer Bear Romper Women's Costume - L</a></div>
          </div>
        </div>`;
      document.getElementById('a-page').appendChild(box);
    });

    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    await expect(page.locator('.aoo-badge').nth(1)).toHaveAttribute('title', 'Size: L · Color: Pink');
  });

  test('language-prefixed paths are handled', async ({ page }) => {
    await page.goto(`${AMAZON}/-/es/spr/returns/prep?orderId=111-2222222-3333333`);
    await expect(page.locator('.aoo-badge')).toHaveCount(1);
  });
});
