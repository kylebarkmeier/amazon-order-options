import { describe, it, expect, vi } from 'vitest';
import { createResolver, mergeOptions, SOURCES } from '../../src/core/resolver.js';
import { createCache, createMemoryStore } from '../../src/core/cache.js';
import { fixtureFetch } from './helpers.js';

const origin = 'https://www.amazon.com';

function makeResolver(overrides = {}) {
  const { fetchText, calls } = fixtureFetch();
  const cache = createCache({ store: createMemoryStore() });
  const resolver = createResolver({ fetchText, cache, ...overrides });
  return { resolver, calls, cache };
}

describe('resolveByAsin', () => {
  it('reads twister data from the product page and caches it', async () => {
    const { resolver, calls } = makeResolver();
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Pink' },
    ]);
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Pink' },
    ]);
    expect(calls).toEqual(['https://www.amazon.com/dp/B0ROMPRMED']);
  });

  it('falls back to DOM variation widgets and caches negative results', async () => {
    const { resolver, calls } = makeResolver();
    expect(await resolver.resolveByAsin(origin, 'B0SHOESGR9')).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
    expect(await resolver.resolveByAsin(origin, 'B0NOTWISTR')).toBeNull();
    expect(await resolver.resolveByAsin(origin, 'B0NOTWISTR')).toBeNull();
    expect(calls.filter((u) => u.endsWith('B0NOTWISTR'))).toHaveLength(1);
  });

  it('returns null for missing asins, failed fetches and disabled fetching', async () => {
    const { resolver } = makeResolver();
    expect(await resolver.resolveByAsin(origin, '')).toBeNull();
    expect(await resolver.resolveByAsin(origin, 'B0MISSING0')).toBeNull();

    const disabled = makeResolver({ settings: { fetchProductPages: false } });
    expect(await disabled.resolver.resolveByAsin(origin, 'B0ROMPRMED')).toBeNull();
    expect(disabled.calls).toEqual([]);
  });

  it('works without a DOM parser', async () => {
    const { resolver } = makeResolver({ parseHtml: () => null });
    expect(await resolver.resolveByAsin(origin, 'B0ROMPRMED')).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Pink' },
    ]);
    expect(await resolver.resolveByAsin(origin, 'B0SHOESGR9')).toBeNull();
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
});

describe('resolveOrderItems', () => {
  it('parses the order page and caches the items', async () => {
    const { resolver, calls } = makeResolver();
    const items = await resolver.resolveOrderItems(origin, '111-2222222-3333333');
    expect(items.map((i) => i.asin)).toEqual(['B0ROMPRMED', 'B0ROMPRLRG', 'B0BODYWSH1']);
    await resolver.resolveOrderItems(origin, '111-2222222-3333333');
    expect(calls).toEqual(['https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333']);
  });

  it('returns an empty list without an id, when disabled, when the fetch fails, or without a parser', async () => {
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
    expect(await failing.resolveOrderItems(origin, '111-2222222-3333333')).toEqual([]);

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
      options: [
        { label: 'Size', value: 'M' },
        { label: 'Color', value: 'Pink' },
        { label: 'Fit', value: 'Regular' },
      ],
      source: SOURCES.PRODUCT,
      asin: 'B0ROMPRMED',
      title: null,
    });
  });

  it('returns page hints without fetching when there is no asin', async () => {
    const { resolver, calls } = makeResolver();
    const result = await resolver.resolveCard({
      origin,
      orderId: '111-2222222-3333333',
      imageId: '61bodyWashXL',
      hints: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }],
    });
    expect(result.source).toBe(SOURCES.PAGE);
    expect(result.options).toEqual([{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }]);
    expect(calls).toEqual([]);
  });

  it('finds the asin through the order page by image id and returns the full title', async () => {
    const { resolver, calls } = makeResolver();
    const result = await resolver.resolveCard({
      origin,
      orderId: '111-2222222-3333333',
      imageId: '71romperMedL',
      title: "Care Bears Cheer Bear Romper Women's...",
      hints: [],
    });
    expect(result).toEqual({
      options: [
        { label: 'Size', value: 'M' },
        { label: 'Color', value: 'Pink' },
      ],
      source: SOURCES.PRODUCT,
      asin: 'B0ROMPRMED',
      title: "Care Bears Cheer Bear Romper Women's Costume - M",
    });
    expect(calls).toEqual([
      'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333',
      'https://www.amazon.com/dp/B0ROMPRMED',
    ]);
  });

  it('falls back to the title when nothing else is available', async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveCard({ origin, title: 'Some Hoodie - XL', hints: [] });
    expect(result).toEqual({ options: [{ label: 'Size', value: 'XL' }], source: SOURCES.TITLE, asin: null, title: null });
  });

  it('uses the full title from the order page for heuristics when the product has no variation', async () => {
    const { resolver } = makeResolver();
    const items = [{ asin: 'B0NOTWISTR', title: 'Thermal Base Layer - Large', imageId: 'imgX' }];
    await resolver.resolveOrderItems(origin, '111-0000000-0000000').catch(() => {});
    const { cache } = makeResolver();
    await cache.set('order:111-0000000-0000000', items, 1000);
    const seeded = createResolver({ fetchText: fixtureFetch().fetchText, cache });
    const result = await seeded.resolveCard({ origin, orderId: '111-0000000-0000000', imageId: 'imgX', title: 'Thermal Base...', hints: [] });
    expect(result).toEqual({ options: [{ label: 'Size', value: 'Large' }], source: SOURCES.TITLE, asin: 'B0NOTWISTR', title: 'Thermal Base Layer - Large' });
  });

  it('returns null when nothing is known, and the title alone when only the title was learned', async () => {
    const { resolver } = makeResolver({ settings: { useTitleHeuristics: false } });
    expect(await resolver.resolveCard({ origin, title: 'Some Hoodie - XL', hints: [] })).toBeNull();

    const { cache } = makeResolver();
    await cache.set('order:111-0000000-0000000', [{ asin: 'B0NOTWISTR', title: 'Plain Thing', imageId: 'imgX' }], 1000);
    const seeded = createResolver({ fetchText: fixtureFetch().fetchText, cache });
    expect(await seeded.resolveCard({ origin, orderId: '111-0000000-0000000', imageId: 'imgX', hints: [] })).toEqual({
      options: [],
      source: SOURCES.PAGE,
      asin: 'B0NOTWISTR',
      title: 'Plain Thing',
    });
  });

  it('treats a missing hints array as empty', async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveCard({ origin, asin: 'B0ROMPRLRG' });
    expect(result.options).toEqual([
      { label: 'Size', value: 'L' },
      { label: 'Color', value: 'Pink' },
    ]);
  });

  it('propagates fetch errors as null results', async () => {
    const fetchText = vi.fn().mockRejectedValue(new Error('offline'));
    const resolver = createResolver({ fetchText, cache: createCache({ store: createMemoryStore() }), settings: { useTitleHeuristics: false } });
    expect(await resolver.resolveCard({ origin, asin: 'B0ROMPRMED', hints: [] })).toBeNull();
    expect(fetchText).toHaveBeenCalledTimes(1);
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
});
