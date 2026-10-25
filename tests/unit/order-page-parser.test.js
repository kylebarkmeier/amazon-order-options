import { describe, it, expect } from 'vitest';
import { parseOrderItems, matchOrderItem, normalizeTitle } from '../../src/core/order-page-parser.js';
import { fixtureDom } from './helpers.js';

describe('parseOrderItems', () => {
  it('parses the order details fixture and ignores nav, cart rail and carousels', () => {
    const doc = fixtureDom('order-details').window.document;
    const items = parseOrderItems(doc);
    expect(items).toEqual([
      { asin: 'B0ROMPRMED', title: "Care Bears Cheer Bear Romper Women's Costume - M", imageId: '71romperMedL' },
      { asin: 'B0ROMPRLRG', title: "Care Bears Cheer Bear Romper Women's Costume - L", imageId: '71romperLrgL' },
      {
        asin: 'B0BODYWSH1',
        title: 'Mirai Clinical Persimmon Body Wash for Old People Smell, Nonenal Solution, 9.30 Fl Oz',
        imageId: '61bodyWashXL',
      },
    ]);
  });

  it('parses the older orders list markup', () => {
    const doc = fixtureDom('orders-list').window.document;
    const items = parseOrderItems(doc);
    expect(items.map((i) => i.asin)).toEqual(['B0ROMPRMED', 'B0ROMPRLRG', 'B0NOTWISTR']);
    expect(items[2].imageId).toBe('55plainItemL');
  });

  it('falls back to any product link and finds the image through a matching link', () => {
    document.body.innerHTML = `
      <div>
        <p><a href="/gp/product/B0FALLBCK1/ref=x"><img src="https://m.media-amazon.com/images/I/12fallbackL._SS40_.jpg"></a></p>
      </div>
      <div>
        <p><a href="/gp/product/B0FALLBCK1/ref=y">Fallback product title here</a></p>
        <p><a href="/dp/B0NOIMAGE1">Second product without any image</a></p>
        <p><a href="/dp/B0NOIMAGE1">Second product without any image</a></p>
        <a href="/gp/help/x">Help</a>
      </div>`;
    expect(parseOrderItems(document)).toEqual([
      { asin: 'B0FALLBCK1', title: 'Fallback product title here', imageId: '12fallbackL' },
      { asin: 'B0NOIMAGE1', title: 'Second product without any image', imageId: null },
    ]);
  });

  it('returns an empty list for bad input', () => {
    expect(parseOrderItems(null)).toEqual([]);
    expect(parseOrderItems({})).toEqual([]);
  });
});

describe('matchOrderItem', () => {
  const items = [
    { asin: 'A1', title: "Care Bears Cheer Bear Romper Women's Costume - M", imageId: 'imgM' },
    { asin: 'A2', title: "Care Bears Cheer Bear Romper Women's Costume - L", imageId: 'imgL' },
    { asin: 'A3', title: 'Completely different product', imageId: null },
  ];

  it('prefers the image id', () => {
    expect(matchOrderItem(items, { imageId: 'imgL', title: 'Care Bears...' }).asin).toBe('A2');
  });

  it('falls back to the longest shared title prefix', () => {
    expect(matchOrderItem(items, { imageId: 'nope', title: 'Completely different pro...' }).asin).toBe('A3');
    expect(matchOrderItem(items, { title: "Care Bears Cheer Bear Romper Women's Costume - L" }).asin).toBe('A2');
  });

  it('rejects weak matches and empty input', () => {
    expect(matchOrderItem(items, { title: 'Care' })).toBeNull();
    expect(matchOrderItem(items, { title: 'Something else entirely' })).toBeNull();
    expect(matchOrderItem(items, {})).toBeNull();
    expect(matchOrderItem([], { imageId: 'imgM' })).toBeNull();
    expect(matchOrderItem(null, { imageId: 'imgM' })).toBeNull();
  });
});

describe('normalizeTitle', () => {
  it('strips ellipses and whitespace and lowercases', () => {
    expect(normalizeTitle('  Foo   Bar... ')).toBe('foo bar');
    expect(normalizeTitle('Foo…')).toBe('foo');
    expect(normalizeTitle(null)).toBe('');
  });
});
