import { describe, it, expect } from 'vitest';
import { findItemCards, findLineItemIdFor, looksLikeMetadataRow, orderIdsIn, uniqueOrderIdIn } from '../../src/core/cards.js';
import { PAGE_TYPES } from '../../src/core/page-detector.js';
import { fixtureDom } from './helpers.js';

describe('findItemCards', () => {
  it('finds the items on the order details page with asins, image ids and line item ids', () => {
    const doc = fixtureDom('order-details').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.ORDER_DETAILS, { orderId: '111-2222222-3333333' });
    expect(cards.map((c) => [c.asin, c.imageId, c.orderId, c.lineItemId])).toEqual([
      ['B0ROMPRMED', '71romperPnkL', '111-2222222-3333333', null],
      ['B0ROMPRLRG', '71romperPnkL', '111-2222222-3333333', null],
      ['B0BODYWSH1', '61bodyWashXL', '111-2222222-3333333', null],
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
    expect(cards[0].hints).toEqual([]);
  });

  it('finds return cart items without links, with hints, order id and line item id from the popover', () => {
    const doc = fixtureDom('returns-cart').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_CART);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      asin: null,
      imageId: '61bodyWashXL',
      title: 'Mirai Clinical Persimmon Body Wash for...',
      orderId: '111-2222222-3333333',
      lineItemId: 'jnmbodywashaaaa',
      hints: [{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }],
    });
    expect(cards[0].truncatedTitle.textContent).toContain('Body Wash for...');
    expect(cards[1]).toMatchObject({ asin: null, imageId: '71romperPnkL', lineItemId: 'jnmrompermedaaa', hints: [] });
    expect(cards[2]).toMatchObject({ asin: null, imageId: '71romperPnkL', lineItemId: 'jnmromperlrgaaa', hints: [] });
  });

  it('uses the page-level order id on single-order pages only when the page names exactly one', () => {
    const doc = fixtureDom('returns-cart').window.document;
    for (const el of doc.querySelectorAll('.a-popover-preload')) el.remove();
    expect(findItemCards(doc, PAGE_TYPES.RETURNS_CART).map((c) => c.orderId)).toEqual(['111-2222222-3333333', '111-2222222-3333333', '111-2222222-3333333']);
    expect(findItemCards(doc, PAGE_TYPES.RETURNS_CART, { orderId: '999-9999999-9999999' }).map((c) => c.orderId)).toEqual([
      '999-9999999-9999999',
      '999-9999999-9999999',
      '999-9999999-9999999',
    ]);
    doc.querySelector('#a-page').insertAdjacentHTML('beforeend', '<p>Also mentions order 111-4444444-5555555</p>');
    expect(findItemCards(doc, PAGE_TYPES.RETURNS_CART).map((c) => c.orderId)).toEqual([null, null, null]);
    expect(findItemCards(doc, PAGE_TYPES.RETURNS_OTHER).map((c) => c.orderId)).toEqual([null, null, null]);
  });

  it('assigns the line item id from the URL when the page is about a single item', () => {
    const doc = fixtureDom('returns-prep').window.document;
    const cards = findItemCards(doc, PAGE_TYPES.RETURNS_PREP, { lineItemId: 'jnmshoesitemaaa' });
    expect(cards).toHaveLength(1);
    expect(cards[0].lineItemId).toBe('jnmshoesitemaaa');
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
    const ids = findItemCards(doc, PAGE_TYPES.RETURNS_CART).map((c) => c.imageId);
    expect(ids).not.toContain('11navImgAAA');
    expect(ids).not.toContain('22cartImgBB');
    expect(ids).not.toContain('99recoImgCC');
  });

  it('drops the order id on unknown pages and handles a document without a body', () => {
    const doc = fixtureDom('order-details').window.document;
    expect(findItemCards(doc, PAGE_TYPES.UNKNOWN).every((c) => c.orderId === null)).toBe(true);

    const empty = fixtureDom('order-details').window.document;
    empty.body.remove();
    expect(empty.body).toBeNull();
    expect(findItemCards(empty, PAGE_TYPES.ORDER_DETAILS)).toEqual([]);
  });

  it('skips cards the caller already handled before doing any work on them', () => {
    const doc = fixtureDom('orders-list').window.document;
    const first = findItemCards(doc, PAGE_TYPES.ORDERS_LIST);
    first[0].element.setAttribute('data-aoo-state', 'done');
    const again = findItemCards(doc, PAGE_TYPES.ORDERS_LIST, { skip: (el) => el.hasAttribute('data-aoo-state') });
    expect(again.map((c) => c.asin)).toEqual(['B0ROMPRLRG', 'B0NOTWISTR']);
  });

  it('ignores images whose card has no title and titles that are prices or metadata rows', () => {
    document.body.innerHTML = `
      <div id="a-page">
        <div class="a-row"><img src="https://m.media-amazon.com/images/I/61loneImage._SS40_.jpg"></div>
        <div class="a-fixed-left-grid">
          <img src="https://m.media-amazon.com/images/I/61priceOnlyL._SS40_.jpg">
          <span>$123.45 total due today</span>
          <span>Quantity: 2 of these</span>
          <span>Sold by: Someone Long Enough</span>
          <span>Size: Extra Large Please</span>
          <button>Buy it again right now please</button>
        </div>
      </div>`;
    expect(findItemCards(document, PAGE_TYPES.ORDER_DETAILS)).toEqual([]);
  });

  it('keeps titles that contain a colon', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-row a-grid-vertical-align">
        <div class="a-column"><img src="https://m.media-amazon.com/images/I/61movieImgL._SS40_.jpg"></div>
        <div class="a-column"><div class="a-row"><span class="a-size-base a-text-bold">Spider-Man: No Way Home [Blu-ray]</span></div><div class="a-row"><span>$19.99</span></div></div>
      </div></div>`;
    const [card] = findItemCards(document, PAGE_TYPES.RETURNS_CART);
    expect(card.title).toBe('Spider-Man: No Way Home [Blu-ray]');
    expect(looksLikeMetadataRow('Spider-Man: No Way Home [Blu-ray]')).toBe(false);
    expect(looksLikeMetadataRow('Quantity: 1')).toBe(true);
    expect(looksLikeMetadataRow('Size: M')).toBe(true);
    expect(looksLikeMetadataRow('No colon here')).toBe(false);
  });

  it('recognises lazy-loaded images with a placeholder src', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-fixed-left-grid">
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://m.media-amazon.com/images/I/71romperPnkL._SS142_.jpg">
        <div><a href="/dp/B0ROMPRMED">A product title long enough</a></div>
      </div></div>`;
    const cards = findItemCards(document, PAGE_TYPES.ORDER_DETAILS);
    expect(cards.map((c) => [c.imageId, c.asin])).toEqual([['71romperPnkL', 'B0ROMPRMED']]);
  });

  it('handles link-wrapped cards and keeps the badge anchor outside the link', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-box-inner"><ul>
        <li><a href="/dp/B0ROMPRMED"><div class="a-row"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS160_.jpg"></div><div class="a-row"><span class="a-size-base">Care Bears Cheer Bear Romper Women's Costume - M</span></div></a></li>
        <li><a href="/dp/B0ROMPRLRG"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS160_.jpg"><span class="a-size-base">Care Bears Cheer Bear Romper Women's Costume - L</span></a></li>
      </ul></div></div>`;
    const cards = findItemCards(document, PAGE_TYPES.ORDERS_LIST);
    expect(cards.map((c) => [c.element.tagName, c.asin, c.title.slice(-1), c.anchorPoint.tagName])).toEqual([
      ['LI', 'B0ROMPRMED', 'M', 'A'],
      ['LI', 'B0ROMPRLRG', 'L', 'A'],
    ]);
    expect(cards[0].anchorPoint.closest('a')).toBe(cards[0].anchorPoint);
  });

  it('treats a container with two product images as a group, not a card', () => {
    document.body.innerHTML = `
      <div id="a-page"><div class="a-row">
        <img src="https://m.media-amazon.com/images/I/61firstImgL._SS40_.jpg"><span>Title A long enough here</span>
        <img src="https://m.media-amazon.com/images/I/61secondImgL._SS40_.jpg"><span>Title B long enough here</span>
      </div></div>`;
    expect(findItemCards(document, PAGE_TYPES.ORDER_DETAILS)).toEqual([]);
  });

  it('marks plain "..." titles as truncated and uses table cells as anchors', () => {
    document.body.innerHTML = `
      <div id="a-page"><table><tr>
        <td><img src="https://m.media-amazon.com/images/I/61someImgL._SS40_.jpg"></td>
        <td><a href="/dp/B0ROMPRMED">A product title that got cut...</a></td>
        <td>$49.99</td>
      </tr></table></div>`;
    const [card] = findItemCards(document, PAGE_TYPES.ORDER_DETAILS);
    expect(card.element.tagName).toBe('TR');
    expect(card.truncatedTitle.tagName).toBe('A');
    expect(card.anchorPoint.tagName).toBe('TD');
  });
});

describe('ids in text', () => {
  it('finds order ids and requires uniqueness', () => {
    document.body.innerHTML = '<div id="x">Order # 111-2222222-3333333 placed</div><div id="y">nothing</div><div id="z">111-2222222-3333333 and 111-4444444-5555555 and 111-2222222-3333333</div>';
    expect(orderIdsIn(document.getElementById('x'))).toEqual(['111-2222222-3333333']);
    expect(orderIdsIn(document.getElementById('y'))).toEqual([]);
    expect(orderIdsIn(document.getElementById('z'))).toEqual(['111-2222222-3333333', '111-4444444-5555555']);
    expect(uniqueOrderIdIn(document.getElementById('x'))).toBe('111-2222222-3333333');
    expect(uniqueOrderIdIn(document.getElementById('z'))).toBeNull();
  });

  it('reads line item ids from popover ids, orc-item ids and data-item-key', () => {
    document.body.innerHTML = `
      <div id="a"><div id="a-popover-jnmikpkuqjtuqup-NkxXhfnQn-self_serviceable-itemDetails-popover" class="a-popover-preload"></div></div>
      <div id="b" class="orc-item" data-should-preselect-item="true"><span>x</span></div>
      <div id="jnmorcitemaaaaa-NWZJVBrZ3-self_serviceable-orc-item" class="orc-item"><div id="c"></div></div>
      <div data-item-key="jnmkeyitemaaaaa-NWZJVBrZ3"><div id="d"></div></div>
      <div id="e"><div id="a-popover-UPPER-itemDetails-popover"></div></div>`;
    expect(findLineItemIdFor(document.getElementById('a'))).toBe('jnmikpkuqjtuqup');
    expect(findLineItemIdFor(document.getElementById('b'))).toBeNull();
    expect(findLineItemIdFor(document.getElementById('c'))).toBe('jnmorcitemaaaaa');
    expect(findLineItemIdFor(document.getElementById('d'))).toBe('jnmkeyitemaaaaa');
    expect(findLineItemIdFor(document.getElementById('e'))).toBeNull();
  });
});
