import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { start } from '../../src/content/index.js';
import { createMemoryStore } from '../../src/core/cache.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';
import { fixtureHtml, fixtureFetch } from './helpers.js';

/**
 * @param {string} fixture
 * @param {string} url
 * @param {object} [options]
 */
async function run(fixture, url, options = {}) {
  const dom = new JSDOM(fixtureHtml(fixture), { url });
  dom.window.__AOO_NO_AUTOSTART__ = true;
  const store = options.store || createMemoryStore();
  if (options.settings) await store.set(SETTINGS_KEY, JSON.stringify(options.settings));
  const { fetchText, calls } = fixtureFetch();
  const handle = await start({ document: dom.window.document, window: dom.window, fetchText: options.fetchText || fetchText, store });
  return { dom, doc: dom.window.document, handle, calls, store };
}

const badges = (doc) => [...doc.querySelectorAll('.aoo-badge')].map((b) => b.title);

describe('content script', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('does nothing on unknown pages', async () => {
    const { handle, doc } = await run('not-amazon', 'https://www.amazon.com/dp/B0ROMPRMED');
    expect(handle).toBeNull();
    expect(doc.querySelector('#aoo-styles')).toBeNull();
  });

  it('annotates the order details page from product data', async () => {
    const { doc, calls, handle } = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink', 'Size: 9.30 Fl Oz (Pack of 1)']);
    expect(calls).toEqual([
      'https://www.amazon.com/dp/B0ROMPRMED',
      'https://www.amazon.com/dp/B0ROMPRLRG',
      'https://www.amazon.com/dp/B0BODYWSH1',
    ]);
    expect(doc.querySelector('#aoo-styles')).not.toBeNull();
    expect(doc.querySelectorAll('[data-aoo-state="done"]')).toHaveLength(3);
    handle.stop();
  });

  it('annotates the return cart using page hints, the order page and the product page', async () => {
    const { doc, calls } = await run('returns-cart', 'https://www.amazon.com/spr/returns/cart?itemId=x&orderId=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: 9.30 Fl Oz (Pack of 1)', 'Size: M · Color: Pink']);
    expect(calls).toEqual([
      'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333',
      'https://www.amazon.com/dp/B0ROMPRMED',
    ]);
    const titles = [...doc.querySelectorAll('#items-expanded-section .a-size-base.a-text-bold')].map((e) => e.textContent);
    expect(titles[1]).toBe("Care Bears Cheer Bear Romper Women's Costume - M");
    expect(titles[0]).toBe('Mirai Clinical Persimmon Body Wash for...');
  });

  it('hoists hidden size and color on the return status page and expands the title', async () => {
    const { doc, calls } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep?orderId=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: 9 Women/8.5 Men · Color: Green']);
    expect(calls).toEqual([]);
    expect(doc.querySelector('.a-truncate-cut').textContent).toMatch(/with USB Charging$/);
    const badge = doc.querySelector('.aoo-badge');
    expect(badge.getAttribute('data-aoo-source')).toBe('page');
    expect(badge.closest('.aok-hidden')).toBeNull();
  });

  it('marks title guesses and leaves items without options alone', async () => {
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    expect(badges(doc)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink']);
    const states = [...doc.querySelectorAll('[data-aoo-state]')].map((e) => e.getAttribute('data-aoo-state'));
    expect(states).toEqual(['done', 'done', 'none']);
  });

  it('falls back to the title when product fetching is disabled', async () => {
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', {
      settings: { fetchProductPages: false },
    });
    expect(badges(doc)).toEqual(['Size: M', 'Size: L']);
    expect(doc.querySelector('.aoo-badge .aoo-source').textContent).toBe('(from title)');
    expect(doc.querySelector('.aoo-badge').getAttribute('data-aoo-source')).toBe('title');
  });

  it('respects the page toggles', async () => {
    const orders = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', { settings: { showOnOrders: false } });
    expect(orders.handle).toBeNull();
    const returns = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep', { settings: { showOnReturns: false } });
    expect(returns.handle).toBeNull();
  });

  it('does not expand titles when disabled', async () => {
    const { doc } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep', { settings: { expandTitles: false } });
    expect(doc.querySelector('.a-truncate-cut').textContent).toMatch(/\.\.\.$/);
  });

  it('uses the plain badge style when configured', async () => {
    const { doc } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep', { settings: { badgeStyle: 'plain' } });
    expect(doc.querySelector('.aoo-badge').getAttribute('data-aoo-style')).toBe('plain');
  });

  it('records an error state when resolution throws', async () => {
    const fetchText = vi.fn(() => Promise.reject(new Error('boom')));
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', {
      fetchText,
      settings: { useTitleHeuristics: false },
    });
    expect([...doc.querySelectorAll('[data-aoo-state]')].map((e) => e.getAttribute('data-aoo-state'))).toEqual(['none', 'none', 'none']);
    expect(badges(doc)).toEqual([]);
  });

  it('rescans when new items are added', async () => {
    const { doc, handle } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    expect(badges(doc)).toHaveLength(2);

    const more = doc.createElement('div');
    more.innerHTML = `
      <div class="a-fixed-left-grid item-box">
        <div class="product-image"><a href="/dp/B0ROMPRLRG"><img src="https://m.media-amazon.com/images/I/71romperLrgL._SS142_.jpg"></a></div>
        <div class="yohtmlc-product-title"><a href="/dp/B0ROMPRLRG">Care Bears Cheer Bear Romper Women's Costume - L</a></div>
      </div>`;
    doc.querySelector('#a-page').appendChild(more);
    await vi.waitFor(() => expect(badges(doc)).toHaveLength(3), { timeout: 3000, interval: 50 });

    // Attribute changes inside a badge, and text-only mutations, do not trigger work.
    const badge = doc.querySelector('.aoo-badge');
    badge.setAttribute('class', 'aoo-badge changed');
    badge.firstChild.textContent = 'x';
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(badges(doc)).toHaveLength(3);
    handle.stop();
  });

  it('returns the same promise for concurrent rescans', async () => {
    const { doc, handle } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    const first = handle.rescan();
    const second = handle.rescan();
    expect(first).toBe(second);
    await first;
    expect(handle.rescan()).not.toBe(first);
    expect(badges(doc)).toHaveLength(2);
    handle.stop();
  });

  it('caches results across runs in the same store', async () => {
    const store = createMemoryStore();
    const first = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333', { store });
    expect(first.calls).toHaveLength(3);
    const second = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333', { store });
    expect(second.calls).toHaveLength(0);
    expect(badges(second.doc)).toHaveLength(3);
  });

  it('uses the window fetch when no fetchText is injected', async () => {
    const dom = new JSDOM(fixtureHtml('orders-list'), { url: 'https://www.amazon.com/gp/css/order-history' });
    dom.window.__AOO_NO_AUTOSTART__ = true;
    const fetchMock = vi.fn(async (url) => {
      const html = fixtureFetch().fetchText(url).catch(() => null);
      const body = await html;
      return { ok: body !== null, status: body === null ? 404 : 200, text: async () => body };
    });
    dom.window.fetch = fetchMock;
    await start({ document: dom.window.document, window: dom.window, store: createMemoryStore() });
    expect(fetchMock).toHaveBeenCalledWith('https://www.amazon.com/dp/B0ROMPRMED', expect.objectContaining({ credentials: 'include' }));
    expect(badges(dom.window.document)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink']);
  });
});
