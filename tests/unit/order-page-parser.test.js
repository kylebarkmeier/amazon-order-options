import { describe, it, expect } from 'vitest';
import { parseOrderItems, matchOrderItem } from '../../src/core/order-page-parser.js';
import { fixtureDom } from './helpers.js';

describe('parseOrderItems', () => {
  it('parses the order details fixture with line item ids and ignores nav, cart rail and carousels', () => {
    const doc = fixtureDom('order-details').window.document;
    expect(parseOrderItems(doc)).toEqual([
      { asin: 'B0ROMPRMED', title: "Care Bears Cheer Bear Romper Women's Costume - M", imageId: '71romperPnkL', lineItemIds: ['jnmrompermedaaa'] },
      { asin: 'B0ROMPRLRG', title: "Care Bears Cheer Bear Romper Women's Costume - L", imageId: '71romperPnkL', lineItemIds: ['jnmromperlrgaaa'] },
      {
        asin: 'B0BODYWSH1',
        title: 'Mirai Clinical Persimmon Body Wash for Old People Smell, Nonenal Solution, 9.30 Fl Oz',
        imageId: '61bodyWashXL',
        lineItemIds: ['jnmbodywashaaaa'],
      },
    ]);
  });

  it('parses the older orders list markup', () => {
    const doc = fixtureDom('orders-list').window.document;
    const items = parseOrderItems(doc);
    expect(items.map((i) => i.asin)).toEqual(['B0ROMPRMED', 'B0ROMPRLRG', 'B0NOTWISTR']);
    expect(items[2].imageId).toBe('55plainItemL');
    expect(items[2].lineItemIds).toEqual([]);
  });

  it('falls back to any product link, including mobile links, and finds the image through a matching link', () => {
    document.body.innerHTML = `
      <div>
        <p><a href="/gp/product/B0FALLBCK1/ref=x"><img src="https://m.media-amazon.com/images/I/12fallbackL._SS40_.jpg"></a></p>
      </div>
      <div>
        <p><a href="/gp/product/B0FALLBCK1/ref=y">Fallback product title here</a></p>
        <p><a href="/dp/B0NOIMAGE1">Second product without any image</a></p>
        <p><a href="/dp/B0NOIMAGE1">Second product without any image</a></p>
        <p><a href="/gp/aw/d/B0MOBILE01">Mobile style product link title</a></p>
        <a href="/gp/help/x">Help</a>
      </div>
      <div data-component="buyAgain"><a href="/dp/B0RECOMEND">Recommended product that must be ignored</a></div>
      <div cel_widget_id="similarities-1"><a href="/dp/B0SIMILAR0">Similar product that must be ignored</a></div>`;
    expect(parseOrderItems(document)).toEqual([
      { asin: 'B0FALLBCK1', title: 'Fallback product title here', imageId: '12fallbackL', lineItemIds: [] },
      { asin: 'B0NOIMAGE1', title: 'Second product without any image', imageId: null, lineItemIds: [] },
      { asin: 'B0MOBILE01', title: 'Mobile style product link title', imageId: null, lineItemIds: [] },
    ]);
  });

  it('reads the full title of a truncated anchor and the asin from the pop link when the title link has none', () => {
    document.body.innerHTML = `
      <div class="a-fixed-left-grid">
        <img src="https://m.media-amazon.com/images/I/61lazyImgL._SS40_.jpg">
        <div data-component="itemTitle"><a href="/some/other/link"><span class="a-truncate"><span class="a-truncate-full a-offscreen">A Very Long Product Title That Was Cut</span><span class="a-truncate-cut">A Very Long Product Ti...</span></span></a></div>
        <div data-component="itemConnections"><a href="/your-orders/pop?orderId=111-2222222-3333333&lineItemId=jnmlazyitemaaaa&asin=B0LAZYITM1">View your item</a></div>
      </div>`;
    expect(parseOrderItems(document)).toEqual([
      { asin: 'B0LAZYITM1', title: 'A Very Long Product Title That Was Cut', imageId: '61lazyImgL', lineItemIds: ['jnmlazyitemaaaa'] },
    ]);
  });

  it('returns an empty list for bad input', () => {
    expect(parseOrderItems(null)).toEqual([]);
    expect(parseOrderItems({})).toEqual([]);
  });
});

describe('matchOrderItem', () => {
  const items = [
    { asin: 'A1', title: "Care Bears Cheer Bear Romper Women's Costume - M", imageId: 'imgPink', lineItemIds: ['itemmedium01'] },
    { asin: 'A2', title: "Care Bears Cheer Bear Romper Women's Costume - L", imageId: 'imgPink', lineItemIds: ['itemlarge001'] },
    { asin: 'A3', title: 'Completely different product', imageId: 'imgOther', lineItemIds: [] },
  ];

  it('matches the line item id exactly', () => {
    expect(matchOrderItem(items, { lineItemId: 'itemlarge001', imageId: 'imgPink', title: 'Care Bears...' }).asin).toBe('A2');
  });

  it('matches a unique image id', () => {
    expect(matchOrderItem(items, { imageId: 'imgOther', title: 'Completely...' }).asin).toBe('A3');
  });

  it('does not guess between two sizes that share an image', () => {
    expect(matchOrderItem(items, { imageId: 'imgPink', title: "Care Bears Cheer Bear Romper Women's..." })).toBeNull();
    expect(matchOrderItem(items, { imageId: 'imgPink' })).toBeNull();
  });

  it('uses the full title to tell two sizes with one image apart', () => {
    expect(matchOrderItem(items, { imageId: 'imgPink', title: "Care Bears Cheer Bear Romper Women's Costume - L" }).asin).toBe('A2');
  });

  it('falls back to a clear title-prefix winner only', () => {
    expect(matchOrderItem(items, { imageId: 'nope', title: 'Completely different pro...' }).asin).toBe('A3');
    expect(matchOrderItem(items, { title: "Care Bears Cheer Bear Romper Women's Costume - L" }).asin).toBe('A2');
    expect(matchOrderItem(items, { title: "Care Bears Cheer Bear Romper Women's..." })).toBeNull();
  });

  it('rejects weak matches and empty input', () => {
    expect(matchOrderItem(items, { title: 'Care' })).toBeNull();
    expect(matchOrderItem(items, { title: 'Something else entirely' })).toBeNull();
    expect(matchOrderItem(items, {})).toBeNull();
    expect(matchOrderItem([], { imageId: 'imgPink' })).toBeNull();
    expect(matchOrderItem(null, { imageId: 'imgPink' })).toBeNull();
  });
});
