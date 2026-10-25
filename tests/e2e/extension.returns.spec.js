import { test, expect } from './extension-fixtures.js';
import { AMAZON, badgeTitles } from './helpers.js';

test.describe('return pages', () => {
  test('return cart shows sizes from the page and from the product data', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/spr/returns/cart?itemId=jnmexampleitem&orderId=111-2222222-3333333`);

    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    expect(await badgeTitles(page)).toEqual(['Size: 9.30 Fl Oz (Pack of 1)', 'Size: M · Color: Pink']);

    // The badge sits directly under the visible title, not inside the hidden popover.
    const romperBadge = page.locator('.aoo-badge').nth(1);
    await expect(romperBadge).toBeVisible();
    await expect(romperBadge.locator('.aoo-value').first()).toHaveText('M');

    // The truncated title was replaced with the full one from the order page.
    await expect(page.locator('#items-expanded-section .a-size-base.a-text-bold').nth(1)).toHaveText(
      "Care Bears Cheer Bear Romper Women's Costume - M",
    );

    // Only the order page and one product page were fetched.
    expect(requestLog.filter((p) => p.endsWith('/order-details'))).toHaveLength(1);
    expect(requestLog.filter((p) => p.startsWith('/dp/'))).toEqual(['/dp/B0ROMPRMED']);
  });

  test('return status page hoists hidden size and color and expands the title', async ({ page, requestLog }) => {
    await page.goto(`${AMAZON}/spr/returns/prep?contractId=x&orderId=111-2222222-3333333`);

    const badge = page.locator('.aoo-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Size: 9 Women/8.5 Men · Color: Green');
    await expect(badge).toHaveAttribute('data-aoo-source', 'page');
    await expect(page.locator('.a-truncate-cut')).toHaveText(/with USB Charging$/);
    expect(requestLog.filter((p) => p.startsWith('/dp/') || p.endsWith('/order-details'))).toEqual([]);
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
            <div class="a-column a-span3"><img src="https://m.media-amazon.com/images/I/71romperLrgL._SS160_.jpg"></div>
            <div class="a-column a-span9"><a href="/dp/B0ROMPRLRG">Care Bears Cheer Bear Romper Women's Costume - L</a></div>
          </div>
        </div>`;
      document.getElementById('a-page').appendChild(box);
    });

    await expect(page.locator('.aoo-badge')).toHaveCount(2);
    await expect(page.locator('.aoo-badge').nth(1)).toHaveAttribute('title', 'Size: L · Color: Pink');
  });
});
