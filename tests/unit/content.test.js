import { describe, it, expect, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { start, isRelevantMutation, STATE_ATTR } from '../../src/content/index.js';
import { createMemoryStore } from '../../src/core/cache.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';
import { fixtureHtml, fixtureFetch } from './helpers.js';

const handles = [];
afterEach(() => {
  for (const h of handles.splice(0)) h?.stop();
  vi.useRealTimers();
});

/**
 * @param {string} fixture
 * @param {string} url
 * @param {object} [options]
 */
async function run(fixture, url, options = {}) {
  const dom = new JSDOM(fixtureHtml(fixture), { url });
  const store = options.store || createMemoryStore();
  if (options.settings) await store.set(SETTINGS_KEY, JSON.stringify(options.settings));
  const { fetchText, calls, modes } = fixtureFetch();
  const handle = await start({
    document: dom.window.document,
    window: dom.window,
    globalObject: options.globalObject || {},
    fetchText: options.fetchText || fetchText,
    store,
    retryDelayMs: options.retryDelayMs,
  });
  handles.push(handle);
  return { dom, doc: dom.window.document, handle, calls, modes, store };
}

const badges = (doc) => [...doc.querySelectorAll('.aoo-badge')].map((b) => b.title);
const states = (doc) => [...doc.querySelectorAll(`[${STATE_ATTR}]`)].map((e) => e.getAttribute(STATE_ATTR));

describe('content script', () => {
  it('does nothing on unknown pages', async () => {
    const { handle, doc } = await run('not-amazon', 'https://www.amazon.com/dp/B0ROMPRMED');
    expect(handle).toBeNull();
    expect(doc.querySelector('#aoo-styles')).toBeNull();
  });

  it('annotates the order details page from product data, fetched anonymously', async () => {
    const { doc, calls, modes } = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink', 'Size: 9.30 Fl Oz (Pack of 1)']);
    expect(calls.sort()).toEqual(['https://www.amazon.com/dp/B0BODYWSH1', 'https://www.amazon.com/dp/B0ROMPRLRG', 'https://www.amazon.com/dp/B0ROMPRMED']);
    expect(new Set(modes)).toEqual(new Set(['omit']));
    expect(doc.querySelector('#aoo-styles')).not.toBeNull();
    expect(doc.documentElement.getAttribute('data-aoo-theme')).toBe('light');
    expect(states(doc)).toEqual(['done', 'done', 'done']);
  });

  it('annotates the return cart, telling two sizes with one image apart and restoring every truncated title', async () => {
    const { doc, calls } = await run('returns-cart', 'https://www.amazon.com/spr/returns/cart?itemId=jnmbodywashaaaa&orderId=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: 9.30 Fl Oz (Pack of 1)', 'Size: M · Color: Pink', 'Size: L · Color: Pink']);
    expect(calls.filter((u) => u.includes('order-details'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/dp/')).sort()).toEqual([
      'https://www.amazon.com/dp/B0BODYWSH1',
      'https://www.amazon.com/dp/B0ROMPRLRG',
      'https://www.amazon.com/dp/B0ROMPRMED',
    ]);
    const titles = [...doc.querySelectorAll('#items-expanded-section .a-size-base.a-text-bold')].map((e) => e.textContent);
    expect(titles).toEqual([
      'Mirai Clinical Persimmon Body Wash for Old People Smell, Nonenal Solution, 9.30 Fl Oz',
      "Care Bears Cheer Bear Romper Women's Costume - M",
      "Care Bears Cheer Bear Romper Women's Costume - L",
    ]);
  });

  it('hoists hidden size and color on the return status page and expands the title from the page itself', async () => {
    const { doc, calls } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep?orderId=111-2222222-3333333');
    expect(badges(doc)).toEqual(['Size: 9 Women/8.5 Men · Color: Green']);
    expect(calls.filter((u) => u.includes('/dp/'))).toEqual([]);
    expect(doc.querySelector('.a-truncate-cut').textContent).toMatch(/with USB Charging$/);
    const badge = doc.querySelector('.aoo-badge');
    expect(badge.getAttribute('data-aoo-source')).toBe('page');
    expect(badge.closest('.aok-hidden')).toBeNull();
  });

  it('expands a truncated title even when the item has no options', async () => {
    const { doc } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep', {
      settings: { fetchOrderPages: false, fetchProductPages: false, useTitleHeuristics: false },
      fetchText: async () => {
        throw new Error('never');
      },
    });
    const dom = doc;
    for (const el of dom.querySelectorAll('[id^="single-item-details-content"]')) el.remove();
    const { doc: doc2 } = await run('returns-prep', 'https://www.amazon.com/spr/returns/prep', {
      settings: { fetchOrderPages: false, fetchProductPages: false, useTitleHeuristics: false },
    });
    expect(badges(doc2)).toEqual(['Size: 9 Women/8.5 Men · Color: Green']);
    expect(doc2.querySelector('.a-truncate-cut').textContent).toMatch(/with USB Charging$/);
  });

  it('leaves items without variations alone once the product page has confirmed it', async () => {
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    expect(badges(doc)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink']);
    expect(states(doc)).toEqual(['done', 'done', 'none']);
  });

  it('falls back to the title when product fetching is disabled', async () => {
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', {
      settings: { fetchProductPages: false, fetchOrderPages: false },
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

  it('retries cards whose lookups failed for a transient reason', async () => {
    let failures = 0;
    const { fetchText } = fixtureFetch();
    // Each product is tried anonymously and then signed in, so six failures cover the first pass.
    const flaky = async (url, init) => {
      if (failures < 6) {
        failures += 1;
        throw new Error('offline');
      }
      return fetchText(url, init);
    };
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', {
      fetchText: flaky,
      settings: { useTitleHeuristics: false },
      retryDelayMs: 20,
    });
    expect(badges(doc)).toEqual([]);
    expect(states(doc)).toEqual(['retry', 'retry', 'retry']);
    await vi.waitFor(() => expect(badges(doc)).toHaveLength(2), { timeout: 3000, interval: 25 });
    expect(states(doc)).toEqual(['done', 'done', 'none']);
  });

  it('gives up retrying after a few attempts', async () => {
    const { doc } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history', {
      fetchText: async () => {
        throw new Error('offline');
      },
      settings: { useTitleHeuristics: false },
      retryDelayMs: 5,
    });
    await vi.waitFor(() => expect(states(doc)).toEqual(['none', 'none', 'none']), { timeout: 3000, interval: 10 });
    expect(doc.querySelector('[data-aoo-retries]').getAttribute('data-aoo-retries')).toBe('3');
  });

  it('records an error state when the resolver itself throws, without losing the other cards', async () => {
    const dom = new JSDOM(fixtureHtml('orders-list'), { url: 'https://www.amazon.com/gp/css/order-history' });
    const resolver = {
      async resolveCard(card) {
        if (card.asin === 'B0ROMPRMED') throw new Error('boom');
        return { options: card.asin === 'B0ROMPRLRG' ? [{ label: 'Size', value: 'L' }] : [], source: 'product', asin: card.asin, title: null, retryable: false };
      },
    };
    const handle = await start({ document: dom.window.document, window: dom.window, globalObject: {}, resolver, store: createMemoryStore() });
    handles.push(handle);
    expect(states(dom.window.document)).toEqual(['error', 'done', 'none']);
    expect(badges(dom.window.document)).toEqual(['Size: L']);
  });

  it('rescans when new items are added, and again after a scan that was requested mid-scan', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const { fetchText } = fixtureFetch();
    const slow = async (url, init) => {
      await gate;
      return fetchText(url, init);
    };
    const dom = new JSDOM(fixtureHtml('orders-list'), { url: 'https://www.amazon.com/gp/css/order-history' });
    const doc = dom.window.document;
    const startPromise = start({ document: doc, window: dom.window, globalObject: {}, fetchText: slow, store: createMemoryStore(), retryDelayMs: 10 });

    // While the first scan waits on the network, Amazon appends another item.
    await new Promise((r) => setTimeout(r, 20));
    const more = doc.createElement('div');
    more.innerHTML = `
      <div class="a-fixed-left-grid item-box">
        <div class="product-image"><a href="/dp/B0ROMPRLRG"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS142_.jpg"></a></div>
        <div class="yohtmlc-product-title"><a href="/dp/B0ROMPRLRG">Care Bears Cheer Bear Romper Women's Costume - L</a></div>
      </div>`;
    doc.querySelector('#a-page').appendChild(more);
    await new Promise((r) => setTimeout(r, 450));
    release();
    const handle = await startPromise;
    handles.push(handle);
    await vi.waitFor(() => expect(badges(doc)).toHaveLength(3), { timeout: 3000, interval: 25 });
  });

  it('returns the same promise for concurrent rescans and runs again afterwards', async () => {
    const { doc, handle } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    const first = handle.rescan();
    const second = handle.rescan();
    expect(first).toBe(second);
    await first;
    expect(badges(doc)).toHaveLength(2);
  });

  it('re-badges a card whose badge was re-rendered away', async () => {
    const { doc, handle } = await run('orders-list', 'https://www.amazon.com/gp/css/order-history');
    doc.querySelector('.aoo-badge').remove();
    expect(badges(doc)).toHaveLength(1);
    await handle.rescan();
    expect(badges(doc)).toHaveLength(2);
  });

  it('caches results across runs in the same store', async () => {
    const store = createMemoryStore();
    const first = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333', { store });
    expect(first.calls).toHaveLength(3);
    const second = await run('order-details', 'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333', { store });
    expect(second.calls).toHaveLength(0);
    expect(badges(second.doc)).toHaveLength(3);
  });

  it('uses the window fetch, anonymously for products, when no fetchText is injected', async () => {
    const dom = new JSDOM(fixtureHtml('orders-list'), { url: 'https://www.amazon.com/gp/css/order-history' });
    const fetchMock = vi.fn(async (url) => {
      const body = await fixtureFetch()
        .fetchText(url)
        .then((r) => r.text)
        .catch(() => null);
      return { ok: body !== null, status: body === null ? 404 : 200, url, text: async () => body };
    });
    dom.window.fetch = fetchMock;
    const handle = await start({ document: dom.window.document, window: dom.window, globalObject: {}, store: createMemoryStore() });
    handles.push(handle);
    expect(fetchMock).toHaveBeenCalledWith('https://www.amazon.com/dp/B0ROMPRMED', expect.objectContaining({ credentials: 'omit' }));
    expect(badges(dom.window.document)).toEqual(['Size: M · Color: Pink', 'Size: L · Color: Pink']);
  });

  it('reads extension storage from the script global, not the page window', async () => {
    const data = {};
    const globalObject = {
      browser: {
        storage: {
          local: {
            get: async (key) => (key in data ? { [key]: data[key] } : {}),
            set: async (obj) => Object.assign(data, obj),
            remove: async (key) => delete data[key],
          },
        },
      },
    };
    data[SETTINGS_KEY] = JSON.stringify({ showOnOrders: false });
    const dom = new JSDOM(fixtureHtml('orders-list'), { url: 'https://www.amazon.com/gp/css/order-history' });
    const handle = await start({ document: dom.window.document, window: dom.window, globalObject, fetchText: fixtureFetch().fetchText });
    expect(handle).toBeNull();
  });
});

describe('isRelevantMutation', () => {
  const record = (overrides) => ({ type: 'childList', addedNodes: [], target: document.body, ...overrides });

  it('ignores the badge insertions and text changes the extension makes itself', () => {
    document.body.innerHTML = '<div id="card"><div class="aoo-badge"><span>x</span></div><span id="title">t</span></div>';
    const badge = document.querySelector('.aoo-badge');
    expect(isRelevantMutation(record({ addedNodes: [badge] }))).toBe(false);
    expect(isRelevantMutation(record({ addedNodes: [document.createTextNode('x')] }))).toBe(false);
    expect(isRelevantMutation(record({ type: 'attributes', target: badge.firstElementChild }))).toBe(false);
    expect(isRelevantMutation(record({ addedNodes: [], target: null }))).toBe(false);
  });

  it('accepts added elements and attribute changes on elements holding images', () => {
    document.body.innerHTML = '<div id="card"><img src="x"></div><div id="plain"></div>';
    const card = document.getElementById('card');
    expect(isRelevantMutation(record({ addedNodes: [document.createElement('div')] }))).toBe(true);
    expect(isRelevantMutation(record({ type: 'attributes', target: card }))).toBe(true);
    expect(isRelevantMutation(record({ type: 'attributes', target: card.firstElementChild }))).toBe(true);
    expect(isRelevantMutation(record({ type: 'attributes', target: document.getElementById('plain') }))).toBe(false);
  });
});
