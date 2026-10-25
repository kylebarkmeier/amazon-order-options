import { describe, it, expect } from 'vitest';
import { findItemCards, findOrderIdInText, fullText, TRUNCATED_TITLE } from '../../src/core/cards.js';
import { PAGE_TYPES } from '../../src/core/page-detector.js';
import { fixtureDom } from './helpers.js';

describe('findItemCards', () => {
  it('finds the items on the order details page with asins and image ids', () => {
    const doc = fixtureDom('order-details').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.ORDER_DETAILS, { orderId: '111-2222222-3333333' });
    expect(cards.map((c) => [c.asin, c.imageId, c.orderId])).toEqual([
      ['B0ROMPRMED', '71romperMedL', '111-2222222-3333333'],
      ['B0ROMPRLRG', '71romperLrgL', '111-2222222-3333333'],
      ['B0BODYWSH1', '61bodyWashXL', '111-2222222-3333333'],
    ]);
    expect(cards[0].title).toBe("Care Bears Cheer Bear Romper Women's Costume - M");
    expect(cards[0].anchorPoint.tagName).toBe('DIV');
    expect(cards[0].anchorPoint.contains(doc.querySelector('[data-component="itemTitle"] a'))).toBe(true);
    expect(cards[0].truncatedTitle).toBeNull();
  });

  it('reads the order id from each order card on the orders list', () => {
    const doc = fixtureDom('orders-list').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.ORDERS_LIST);
    expect(cards.map((c) => [c.asin, c.orderId])).toEqual([
      ['B0ROMPRMED', '111-2222222-3333333'],
      ['B0ROMPRLRG', '111-2222222-3333333'],
      ['B0NOTWISTR', '111-4444444-5555555'],
    ]);
  });

  it('finds return cart items without links and collects hints and the order id from the popover', () => {
    const doc = fixtureDom('returns-cart').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_CART);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      asin: null,
      imageId: '61bodyWashXL',
      title: 'Mirai Clinical Persimmon Body Wash for...',
      orderId: '111-2222222-3333333',
      hints: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }],
    });
    expect(cards[0].truncatedTitle.textContent).toContain('Body Wash for...');
    expect(cards[1]).toMatchObject({
      asin: null,
      imageId: '71romperMedL',
      title: "Care Bears Cheer Bear Romper Women's...",
      orderId: '111-2222222-3333333',
      hints: [],
    });
  });

  it('uses the page-level order id on single-order pages when the card has none', () => {
    const doc = fixtureDom('returns-cart').window.document;
    for (const el of doc.querySelectorAll('.a-popover-preload')) el.remove();
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_CART);
    expect(cards.map((c) => c.orderId)).toEqual(['111-2222222-3333333', '111-2222222-3333333']);
    const fromUrl = findItemCards(doc, PAGE_TYPES.RETURNS_CART, { orderId: '999-9999999-9999999' });
    expect(fromUrl.map((c) => c.orderId)).toEqual(['999-9999999-9999999', '999-9999999-9999999']);
  });

  it('finds the return status item, prefers the full title and keeps the truncated element', () => {
    const doc = fixtureDom('returns-prep').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_PREP);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toMatch(/with USB Charging$/);
    expect(cards[0].truncatedTitle.classList.contains('a-truncate-cut')).toBe(true);
    expect(cards[0].hints).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
  });

  it('finds items on the your returns page', () => {
    const doc = fixtureDom('your-returns').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.YOUR_RETURNS);
    expect(cards.map((c) => c.asin)).toEqual(['B0SHOESGR9', 'B0ROMPRMED']);
    expect(cards[0].hints).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
    expect(cards[1].orderId).toBeNull();
  });

  it('skips navigation, cart rail, carousels, hidden blocks and summaries', () => {
    const doc = fixtureDom('returns-cart').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_CART);
    const ids = cards.map((c) => c.imageId);
    expect(ids).not.toContain('11navImgAAA');
    expect(ids).not.toContain('22cartImgBB');
    expect(ids).not.toContain('99recoImgCC');
  });

  it('drops the order id on unknown pages and handles pages without a body', () => {
    const doc = fixtureDom('order-details').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.UNKNOWN);
    expect(cards.every((c) => c.orderId === null)).toBe(true);

    const empty = fixtureDom('order-details').window.document;
    empty.documentElement.innerHTML = '<head></head>';
    expect(findItemCards(empty, PAGE_TYPES.ORDER_DETAILS)).toEqual([]);
  });

  it('ignores images whose card has no title and titles that look like prices or labels', () => {
    document.body.innerHTML = `
      <div id="a-page">
        <div class="a-row"><img src="https://m.media-amazon.com/images/I/61loneImage._SS40_.jpg"></div>
        <div class="a-fixed-left-grid">
          <img src="https://m.media-amazon.com/images/I/61priceOnlyL._SS40_.jpg">
          <span>$123.45 total due today</span>
          <span>Quantity: 2 of these</span>
          <span>Sold by: Someone Long Enough</span>
          <button>Buy it again right now please</button>
        </div>
      </div>`;
    expect(findItemCards(document, PAGE_TYPES.ORDER_DETAILS)).toEqual([]);
  });

  it('marks plain "..." titles as truncated', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-fixed-left-grid">
        <img src="https://m.media-amazon.com/images/I/61someImgL._SS40_.jpg">
        <div><a href="/dp/B0ROMPRMED">A product title that got cut...</a></div>
      </div></div>`;
    const [card] = findItemCards(document, PAGE_TYPES.ORDER_DETAILS);
    expect(card.truncatedTitle.tagName).toBe('A');
    expect(card.anchorPoint.tagName).toBe('DIV');
  });

  it('does not report the same card twice', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-fixed-left-grid">
        <img src="https://m.media-amazon.com/images/I/61firstImgL._SS40_.jpg">
        <img src="https://m.media-amazon.com/images/I/61secondImgL._SS40_.jpg">
        <div><a href="/dp/B0ROMPRMED">A product title long enough</a></div>
      </div></div>`;
    expect(findItemCards(document, PAGE_TYPES.ORDER_DETAILS)).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('finds order ids in text', () => {
    document.body.innerHTML = '<div id="x">Order # 111-2222222-3333333 placed</div><div id="y">nothing</div>';
    expect(findOrderIdInText(document.getElementById('x'))).toBe('111-2222222-3333333');
    expect(findOrderIdInText(document.getElementById('y'))).toBeNull();
  });

  it('prefers the full text of truncated titles', () => {
    document.body.innerHTML = '<span id="t"><span class="a-truncate-full">Full title here</span><span class="a-truncate-cut">Full ti...</span></span><span id="u">  Plain   text </span>';
    expect(fullText(document.getElementById('t'))).toBe('Full title here');
    expect(fullText(document.getElementById('u'))).toBe('Plain text');
  });

  it('detects truncated titles', () => {
    expect(TRUNCATED_TITLE.test('Cut...')).toBe(true);
    expect(TRUNCATED_TITLE.test('Cut…')).toBe(true);
    expect(TRUNCATED_TITLE.test('Complete')).toBe(false);
  });
});
