import { describe, it, expect, vi } from 'vitest';
import { createResolver, mergeOptions, SOURCES, PRODUCT_TTL, NEGATIVE_TTL } from '../../src/core/resolver.js';
import { createCache, createMemoryStore } from '../../src/core/cache.js';
import { fixtureFetch, fixtureHtml } from './helpers.js';

const origin = 'https://www.amazon.com';

function makeResolver(overrides = {}) {
  const { fetchText, calls, modes } = fixtureFetch();
  const store = createMemoryStore();
  const cache = createCache({ store });
  const resolver = createResolver({ fetchText, cache, ...overrides });
  return { resolver, calls, modes, cache, store };
}

const romperM = [
  { label: 'Size', value: 'M' },
  { label: 'Color', value: 'Pink' },
];

describe('resolveByAsin', () => {
  it('reads twister data from the product page anonymously and caches it per marketplace', async () => {
    const { resolver, calls, modes, store } = makeResolver();
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual({ options: romperM, confirmed: true });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual({ options: romperM, confirmed: true });
    expect(calls).toEqual(['https://www.amazon.com/dp/B0ROMPRMED']);
    expect(modes).toEqual(['omit']);
    expect(await store.get('aoo:asin:amazon.com:B0ROMPRMED')).toContain('"confirmed":true');

    await resolver.resolveByAsin('https://www.amazon.de', 'B0ROMPRMED');
    expect(calls).toHaveLength(2);
    expect(await store.get('aoo:asin:amazon.de:B0ROMPRMED')).not.toBeNull();
  });

  it('falls back to DOM variation widgets and remembers a confirmed empty result', async () => {
    const { resolver, calls } = makeResolver();
    expect(await resolver.resolveByAsin(origin, 'B0SHOESGR9')).toEqual({
      options: [
        { label: 'Size', value: '9 Women/8.5 Men' },
        { label: 'Color', value: 'Green' },
      ],
      confirmed: true,
    });
    expect(await resolver.resolveByAsin(origin, 'B0NOTWISTR')).toEqual({ options: [], confirmed: true });
    expect(await resolver.resolveByAsin(origin, 'B0NOTWISTR')).toEqual({ options: [], confirmed: true });
    expect(calls.filter((u) => u.endsWith('B0NOTWISTR'))).toHaveLength(1);
  });

  it('does not cache a page that is not a product page, and retries signed in first', async () => {
    const fetchText = vi.fn(async () => '<html><body><form>Type the characters you see in this image</form></body></html>');
    const cache = createCache({ store: createMemoryStore() });
    const resolver = createResolver({ fetchText, cache });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toBeNull();
    expect(fetchText.mock.calls.map((c) => c[1].credentials)).toEqual(['omit', 'include']);
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toBeNull();
    expect(fetchText).toHaveBeenCalledTimes(4);
  });

  it('uses the signed-in copy when the anonymous one is an interstitial', async () => {
    const fetchText = vi.fn(async (url, init) =>
      init.credentials === 'omit' ? '<html>robot check</html>' : { text: fixtureHtml('product-B0ROMPRMED'), url },
    );
    const resolver = createResolver({ fetchText, cache: createCache({ store: createMemoryStore() }) });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual({ options: romperM, confirmed: true });
  });

  it('does not trust a page that redirected to another product', async () => {
    const fetchText = vi.fn(async () => ({ text: fixtureHtml('product-B0ROMPRMED'), url: 'https://www.amazon.com/Some-Title/dp/B0ROMPRMED/ref=x' }));
    const cache = createCache({ store: createMemoryStore() });
    const resolver = createResolver({ fetchText, cache });
    // The requested ASIN is not in the family the page describes.
    expect(await resolver.resolveByAsin(origin, 'B0RETIRED0')).toEqual({ options: [], confirmed: false });
    expect(await resolver.resolveByAsin(origin, 'B0RETIRED0')).toEqual({ options: [], confirmed: false });
    expect(fetchText).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(await cache.get('x').then(() => null) ?? 'null');
    expect(stored).toBeNull();
    // A sibling that is in the family resolves normally even through the redirect.
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRXLG')).toEqual({
      options: [
        { label: 'Size', value: 'XL' },
        { label: 'Color', value: 'Pink' },
      ],
      confirmed: true,
    });
  });

  it('only reads the selected variation from the DOM when the page is about the requested asin', async () => {
    const html = `<div id="dp"><span id="productTitle">x</span>
      <script>"dimensionValuesDisplayData" : {"B0OTHER000":["S"]}, "dimensions": ["size_name"], "currentAsin" : "B0OTHER000"</script>
      <div id="variation_size_name"><span class="selection">S</span></div></div>`;
    const resolver = createResolver({ fetchText: async () => html, cache: createCache({ store: createMemoryStore() }) });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual({ options: [], confirmed: false });
    expect(await resolver.resolveByAsin(origin, 'B0OTHER000')).toEqual({ options: [{ label: 'Size', value: 'S' }], confirmed: true });
  });

  it('returns null for missing asins, failed fetches and disabled fetching', async () => {
    const { resolver } = makeResolver();
    expect(await resolver.resolveByAsin(origin, '')).toBeNull();
    expect(await resolver.resolveByAsin(origin, 'B0MISSING0')).toBeNull();

    const disabled = makeResolver({ settings: { fetchProductPages: false } });
    expect(await disabled.resolver.resolveByAsin(origin, 'B0ROMPRMED')).toBeNull();
    expect(disabled.calls).toEqual([]);
  });

  it('accepts cache entries written as plain arrays', async () => {
    const { resolver, cache } = makeResolver();
    await cache.set('asin:amazon.com:B0LEGACY00', [{ label: 'Size', value: 'S' }], PRODUCT_TTL);
    expect(await resolver.resolveByAsin(origin, 'B0LEGACY00')).toEqual({ options: [{ label: 'Size', value: 'S' }], confirmed: true });
  });

  it('works without a DOM parser', async () => {
    const { resolver } = makeResolver({ parseHtml: () => null });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual({ options: romperM, confirmed: true });
    expect(await resolver.resolveByAsin(origin, 'B0SHOESGR9')).toEqual({ options: [], confirmed: true });
  });

  it('deduplicates concurrent requests and respects the per-page cap', async () => {
    const { resolver, calls } = makeResolver({ maxFetchesPerPage: 2 });
    const [a, b] = await Promise.all([resolver.resolveByAsin(origin, 'B0ROMPRMED'), resolver.resolveByAsin(origin, 'B0ROMPRMED')]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRLRG')).not.toBeNull();
    expect(await resolver.resolveByAsin(origin, 'B0BODYWSH1')).toBeNull();
    expect(calls).toHaveLength(2);
    expect(resolver.fetchCount).toBe(2);
  });

  it('limits how many fetches are in flight at once', async () => {
    let active = 0;
    let peak = 0;
    const fetchText = vi.fn(async (url) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      const asin = url.slice(-10);
      return fixtureHtml(`product-${asin}`);
    });
    const resolver = createResolver({ fetchText, cache: createCache({ store: createMemoryStore() }), maxConcurrent: 2 });
    await Promise.all(['B0ROMPRMED', 'B0ROMPRLRG', 'B0BODYWSH1', 'B0NOTWISTR', 'B0SHOESGR9'].map((asin) => resolver.resolveByAsin(origin, asin)));
    expect(fetchText).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });
});

describe('resolveOrderItems', () => {
  it('parses the order page with line item ids and caches the items', async () => {
    const { resolver, calls, modes } = makeResolver();
    const items = await resolver.resolveOrderItems(origin, '111-2222222-3333333');
    expect(items.map((i) => [i.asin, i.lineItemIds[0]])).toEqual([
      ['B0ROMPRMED', 'jnmrompermedaaa'],
      ['B0ROMPRLRG', 'jnmromperlrgaaa'],
      ['B0BODYWSH1', 'jnmbodywashaaaa'],
    ]);
    await resolver.resolveOrderItems(origin, '111-2222222-3333333');
    expect(calls).toEqual(['https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333']);
    expect(modes).toEqual(['include']);
  });

  it('distinguishes a failed fetch (null) from a page without items ([])', async () => {
    const { resolver } = makeResolver();
    expect(await resolver.resolveOrderItems(origin, '')).toEqual([]);

    const disabled = makeResolver({ settings: { fetchOrderPages: false } });
    expect(await disabled.resolver.resolveOrderItems(origin, '111-2222222-3333333')).toEqual([]);

    const failing = createResolver({
      fetchText: async () => {
        throw new Error('network');
      },
      cache: createCache({ store: createMemoryStore() }),
    });
    expect(await failing.resolveOrderItems(origin, '111-2222222-3333333')).toBeNull();

    const noParser = makeResolver({ parseHtml: () => null });
    expect(await noParser.resolver.resolveOrderItems(origin, '111-2222222-3333333')).toEqual([]);
  });
});

describe('resolveCard', () => {
  it('uses the product page when the asin is known and merges page hints', async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveCard({
      origin,
      asin: 'B0ROMPRMED',
      hints: [
        { label: 'Colour', value: 'Rose' },
        { label: 'Fit', value: 'Regular' },
      ],
    });
    expect(result).toEqual({
      options: [...romperM, { label: 'Fit', value: 'Regular' }],
      source: SOURCES.PRODUCT,
      asin: 'B0ROMPRMED',
      title: null,
      retryable: false,
    });
  });

  it('looks the item up on the order page even when the page has hints, so the full title is learned', async () => {
    const { resolver, calls } = makeResolver();
    const result = await resolver.resolveCard({
      origin,
      orderId: '111-2222222-3333333',
      lineItemId: 'jnmbodywashaaaa',
      imageId: '61bodyWashXL',
      title: 'Mirai Clinical Persimmon Body Wash for...',
      hints: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }],
    });
    expect(result).toEqual({
      options: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }],
      source: SOURCES.PRODUCT,
      asin: 'B0BODYWSH1',
      title: 'Mirai Clinical Persimmon Body Wash for Old People Smell, Nonenal Solution, 9.30 Fl Oz',
      retryable: false,
    });
    expect(calls).toEqual([
      'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333',
      'https://www.amazon.com/dp/B0BODYWSH1',
    ]);
  });

  it('tells two sizes that share an image apart by line item id', async () => {
    const { resolver } = makeResolver();
    const probe = { origin, orderId: '111-2222222-3333333', imageId: '71romperPnkL', title: "Care Bears Cheer Bear Romper Women's...", hints: [] };
    const medium = await resolver.resolveCard({ ...probe, lineItemId: 'jnmrompermedaaa' });
    const large = await resolver.resolveCard({ ...probe, lineItemId: 'jnmromperlrgaaa' });
    expect(medium.options[0]).toEqual({ label: 'Size', value: 'M' });
    expect(medium.title).toMatch(/- M$/);
    expect(large.options[0]).toEqual({ label: 'Size', value: 'L' });
    expect(large.title).toMatch(/- L$/);
  });

  it('refuses to guess when two sizes share an image and no id is available', async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveCard({
      origin,
      orderId: '111-2222222-3333333',
      imageId: '71romperPnkL',
      title: "Care Bears Cheer Bear Romper Women's...",
      hints: [],
    });
    expect(result).toEqual({ options: [], source: SOURCES.PAGE, asin: null, title: null, retryable: false });
  });

  it('returns page hints without a product fetch when there is no asin and no order', async () => {
    const { resolver, calls } = makeResolver();
    const result = await resolver.resolveCard({ origin, hints: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }] });
    expect(result.source).toBe(SOURCES.PAGE);
    expect(result.options).toEqual([{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }]);
    expect(calls).toEqual([]);
  });

  it('falls back to the title only when nothing authoritative was reachable', async () => {
    const { resolver } = makeResolver();
    expect(await resolver.resolveCard({ origin, title: 'Some Hoodie - XL', hints: [] })).toEqual({
      options: [{ label: 'Size', value: 'XL' }],
      source: SOURCES.TITLE,
      asin: null,
      title: null,
      retryable: false,
    });
    // The product page has confirmed this item has no variation: no guess from the title.
    expect(await resolver.resolveCard({ origin, asin: 'B0NOTWISTR', title: 'USB-C Cable - Long', hints: [] })).toEqual({
      options: [],
      source: SOURCES.PAGE,
      asin: 'B0NOTWISTR',
      title: null,
      retryable: false,
    });
  });

  it('marks results retryable when a fetch failed, and still guesses from the title meanwhile', async () => {
    const fetchText = vi.fn().mockRejectedValue(new Error('offline'));
    const resolver = createResolver({ fetchText, cache: createCache({ store: createMemoryStore() }) });
    expect(await resolver.resolveCard({ origin, asin: 'B0ROMPRMED', title: 'Hoodie - XL', hints: [] })).toEqual({
      options: [{ label: 'Size', value: 'XL' }],
      source: SOURCES.TITLE,
      asin: 'B0ROMPRMED',
      title: null,
      retryable: true,
    });
    expect(await resolver.resolveCard({ origin, orderId: '111-2222222-3333333', imageId: 'img', title: 'Plain thing', hints: [] })).toEqual({
      options: [],
      source: SOURCES.PAGE,
      asin: null,
      title: null,
      retryable: true,
    });
    const offline = createResolver({ fetchText, cache: createCache({ store: createMemoryStore() }), settings: { fetchProductPages: false, fetchOrderPages: false } });
    expect((await offline.resolveCard({ origin, asin: 'B0ROMPRMED', hints: [] })).retryable).toBe(false);
  });

  it('treats a missing hints array as empty and honours the title heuristics switch', async () => {
    const { resolver } = makeResolver();
    expect((await resolver.resolveCard({ origin, asin: 'B0ROMPRLRG' })).options).toEqual([
      { label: 'Size', value: 'L' },
      { label: 'Color', value: 'Pink' },
    ]);
    const noGuess = makeResolver({ settings: { useTitleHeuristics: false } });
    expect((await noGuess.resolver.resolveCard({ origin, title: 'Some Hoodie - XL', hints: [] })).options).toEqual([]);
  });
});

describe('mergeOptions', () => {
  it('prefers product data and dedupes colour/color', () => {
    expect(
      mergeOptions(
        [
          { label: 'Colour', value: 'Rose' },
          { label: 'Size', value: 'Medium' },
          { label: 'Fit', value: 'Slim' },
        ],
        [{ label: 'Color', value: 'Pink' }],
      ),
    ).toEqual([
      { label: 'Color', value: 'Pink' },
      { label: 'Size', value: 'Medium' },
      { label: 'Fit', value: 'Slim' },
    ]);
    expect(mergeOptions([], null)).toEqual([]);
  });

  it('exposes the cache lifetimes', () => {
    expect(PRODUCT_TTL).toBeGreaterThan(NEGATIVE_TTL);
  });
});
