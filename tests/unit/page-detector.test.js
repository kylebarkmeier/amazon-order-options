import { describe, it, expect } from 'vitest';
import {
  PAGE_TYPES,
  AMAZON_HOST_PATTERN,
  canonicalPath,
  detectPageType,
  getOrderIdFromUrl,
  getLineItemIdFromUrl,
  isAmazonHost,
  isLineItemId,
  isOrderId,
  marketplaceOf,
  orderDetailsUrl,
  productUrl,
  asinFromHref,
} from '../../src/core/page-detector.js';
import { AMAZON_TLDS } from '../../src/core/hosts.js';

describe('isAmazonHost', () => {
  it.each([
    'www.amazon.com',
    'amazon.com',
    'www.amazon.co.uk',
    'www.amazon.de',
    'www.amazon.co.jp',
    'www.amazon.com.au',
    'www.amazon.com.be',
    'smile.amazon.com',
  ])('accepts %s', (host) => {
    expect(isAmazonHost(host)).toBe(true);
  });

  it.each(['example.com', 'amazon.com.evil.net', 'notamazon.com', '', undefined])('rejects %s', (host) => {
    expect(isAmazonHost(host)).toBe(false);
  });

  it('is built from the shared marketplace list', () => {
    for (const tld of AMAZON_TLDS) expect(AMAZON_HOST_PATTERN.test(`www.amazon.${tld}`)).toBe(true);
  });
});

describe('canonicalPath', () => {
  it.each([
    ['/-/en/spr/returns/cart', '/spr/returns/cart'],
    ['/-/es/your-orders/orders/', '/your-orders/orders'],
    ['/-/zh_TW/your-returns', '/your-returns'],
    ['/-/en', ''],
    ['/spr/returns/cart', '/spr/returns/cart'],
    ['/Your-Orders/', '/your-orders'],
  ])('%s -> %s', (input, expected) => {
    expect(canonicalPath(input)).toBe(expected);
  });
});

describe('detectPageType', () => {
  it.each([
    ['https://www.amazon.com/gp/css/order-history', PAGE_TYPES.ORDERS_LIST],
    ['https://www.amazon.com/gp/css/order-history?ref_=nav_orders_first', PAGE_TYPES.ORDERS_LIST],
    ['https://www.amazon.com/your-orders/orders?timeFilter=year-2026', PAGE_TYPES.ORDERS_LIST],
    ['https://www.amazon.co.uk/gp/your-account/order-history', PAGE_TYPES.ORDERS_LIST],
    ['https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333', PAGE_TYPES.ORDER_DETAILS],
    ['https://www.amazon.com/gp/your-account/order-details?orderID=111-2222222-3333333', PAGE_TYPES.ORDER_DETAILS],
    ['https://www.amazon.com/gp/css/summary/edit.html?orderID=111-2222222-3333333', PAGE_TYPES.ORDER_DETAILS],
    ['https://www.amazon.com/spr/returns/cart?itemId=abc&orderId=111-2222222-3333333', PAGE_TYPES.RETURNS_CART],
    ['https://www.amazon.com/spr/returns/prep?contractId=x&orderId=111-2222222-3333333', PAGE_TYPES.RETURNS_PREP],
    ['https://www.amazon.com/spr/returns/confirmation', PAGE_TYPES.RETURNS_PREP],
    ['https://www.amazon.com/spr/returns/something-else', PAGE_TYPES.RETURNS_OTHER],
    ['https://www.amazon.com/gp/css/returns/homepage.html', PAGE_TYPES.RETURNS_OTHER],
    ['https://www.amazon.com/your-returns?ref_=orc', PAGE_TYPES.YOUR_RETURNS],
    ['https://www.amazon.com/your-returns/', PAGE_TYPES.YOUR_RETURNS],
    // Language-prefixed paths, used when the UI language differs from the site default.
    ['https://www.amazon.de/-/en/spr/returns/cart?orderId=111-2222222-3333333', PAGE_TYPES.RETURNS_CART],
    ['https://www.amazon.de/-/en/spr/returns/prep?orderId=111-2222222-3333333', PAGE_TYPES.RETURNS_PREP],
    ['https://www.amazon.de/-/en/your-returns', PAGE_TYPES.YOUR_RETURNS],
    ['https://www.amazon.com/-/es/your-orders/orders', PAGE_TYPES.ORDERS_LIST],
    ['https://www.amazon.com/-/es/your-orders/order-details?orderID=111-2222222-3333333', PAGE_TYPES.ORDER_DETAILS],
    ['https://www.amazon.com/dp/B0ROMPRMED', PAGE_TYPES.UNKNOWN],
    ['https://www.amazon.com/', PAGE_TYPES.UNKNOWN],
    ['https://example.com/your-orders/order-details', PAGE_TYPES.UNKNOWN],
    ['not a url', PAGE_TYPES.UNKNOWN],
  ])('%s -> %s', (url, expected) => {
    expect(detectPageType(url)).toBe(expected);
  });
});

describe('order ids', () => {
  it('reads orderID and orderId query params', () => {
    expect(getOrderIdFromUrl('https://www.amazon.com/x?orderID=111-2222222-3333333')).toBe('111-2222222-3333333');
    expect(getOrderIdFromUrl('https://www.amazon.com/x?a=1&orderId=111-2222222-3333333')).toBe('111-2222222-3333333');
  });

  it('ignores malformed ids and missing params', () => {
    expect(getOrderIdFromUrl('https://www.amazon.com/x?orderID=nope')).toBeNull();
    expect(getOrderIdFromUrl('https://www.amazon.com/x')).toBeNull();
    expect(getOrderIdFromUrl('garbage')).toBeNull();
  });

  it('validates the id shape', () => {
    expect(isOrderId('111-2222222-3333333')).toBe(true);
    expect(isOrderId(' 111-2222222-3333333 ')).toBe(true);
    expect(isOrderId('111-222-333')).toBe(false);
    expect(isOrderId(null)).toBe(false);
  });
});

describe('line item ids', () => {
  it('reads lineItemId and itemId query params', () => {
    expect(getLineItemIdFromUrl('https://www.amazon.com/your-orders/pop?orderId=1&lineItemId=jnmrompermedaaa&asin=B0ROMPRMED')).toBe('jnmrompermedaaa');
    expect(getLineItemIdFromUrl('https://www.amazon.com/spr/returns/cart?itemId=jnmbodywashaaaa&orderId=111-2222222-3333333')).toBe('jnmbodywashaaaa');
    expect(getLineItemIdFromUrl('https://www.amazon.com/spr/returns/cart?itemId=NOT%20AN%20ID')).toBeNull();
    expect(getLineItemIdFromUrl('https://www.amazon.com/x')).toBeNull();
    expect(getLineItemIdFromUrl('garbage')).toBeNull();
  });

  it('validates the id shape', () => {
    expect(isLineItemId('jnmikpkuqjtuqup')).toBe(true);
    expect(isLineItemId('abc123de')).toBe(true);
    expect(isLineItemId('short')).toBe(false);
    expect(isLineItemId('Has-Dash-123')).toBe(false);
    expect(isLineItemId('')).toBe(false);
  });
});

describe('url builders', () => {
  it('builds the order details url', () => {
    expect(orderDetailsUrl('https://www.amazon.com', '111-2222222-3333333')).toBe(
      'https://www.amazon.com/your-orders/order-details?orderID=111-2222222-3333333',
    );
  });

  it('builds the product url', () => {
    expect(productUrl('https://www.amazon.de', 'B0ROMPRMED')).toBe('https://www.amazon.de/dp/B0ROMPRMED');
  });

  it('names the marketplace of an origin', () => {
    expect(marketplaceOf('https://www.amazon.com')).toBe('amazon.com');
    expect(marketplaceOf('https://smile.amazon.co.uk')).toBe('amazon.co.uk');
    expect(marketplaceOf('https://www.amazon.de/-/en/x')).toBe('amazon.de');
    expect(marketplaceOf('garbage')).toBe('garbage');
    expect(marketplaceOf('')).toBe('unknown');
  });
});

describe('asinFromHref', () => {
  it.each([
    ['/dp/B0ROMPRMED?ref=x', 'B0ROMPRMED'],
    ['https://www.amazon.com/dp/B0ROMPRMED', 'B0ROMPRMED'],
    ['/gp/product/B0CARTITEM/ref=ewc_pr_img_1', 'B0CARTITEM'],
    ['/Sneakers-Flashing/dp/B0SHOESGR9/ref=yr', 'B0SHOESGR9'],
    ['/gp/aw/d/B0MOBILE01', 'B0MOBILE01'],
    ['/dp/b0lowercas', 'B0LOWERCAS'],
    ['/dp/TOOSHORT', null],
    ['/gp/help/customer', null],
    ['', null],
    [null, null],
  ])('%s -> %s', (href, expected) => {
    expect(asinFromHref(href)).toBe(expected);
  });
});
