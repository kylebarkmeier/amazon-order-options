import { AMAZON_TLDS } from './hosts.js';

/**
 * Classifies Amazon URLs into the page types the extension cares about and
 * pulls out identifiers from the query string.
 */

export const PAGE_TYPES = Object.freeze({
  ORDERS_LIST: 'orders-list',
  ORDER_DETAILS: 'order-details',
  RETURNS_CART: 'returns-cart',
  RETURNS_PREP: 'returns-prep',
  RETURNS_OTHER: 'returns-other',
  YOUR_RETURNS: 'your-returns',
  UNKNOWN: 'unknown',
});

/** Amazon retail hostnames the extension runs on, built from the shared marketplace list. */
export const AMAZON_HOST_PATTERN = new RegExp(`(^|\\.)amazon\\.(${AMAZON_TLDS.map((t) => t.replace(/\./g, '\\.')).join('|')})$`, 'i');

/** Amazon prefixes paths with a language segment such as /-/en/ or /-/es/ when the UI language differs from the site default. */
const LANGUAGE_PREFIX = /^\/-\/[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?(?=\/|$)/;

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAmazonHost(hostname) {
  return AMAZON_HOST_PATTERN.test(String(hostname || '').toLowerCase());
}

/**
 * @param {string} url
 * @returns {URL|null}
 */
function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * The path with any language prefix and trailing slash removed, lower-cased.
 *
 * @param {string} pathname
 * @returns {string}
 */
export function canonicalPath(pathname) {
  return String(pathname || '')
    .replace(LANGUAGE_PREFIX, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * @param {string} url
 * @returns {string} one of PAGE_TYPES
 */
export function detectPageType(url) {
  const parsed = safeUrl(url);
  if (!parsed || !isAmazonHost(parsed.hostname)) return PAGE_TYPES.UNKNOWN;

  const path = canonicalPath(parsed.pathname);

  if (path === '/your-returns' || /\/css\/returns\/(history|list)/.test(path)) return PAGE_TYPES.YOUR_RETURNS;
  if (path === '/spr/returns/cart') return PAGE_TYPES.RETURNS_CART;
  if (/^\/spr\/returns\/(prep|confirmation|summary|label|status)/.test(path)) return PAGE_TYPES.RETURNS_PREP;
  if (/^\/spr\/returns/.test(path) || /\/css\/returns\//.test(path) || /^\/returns\b/.test(path)) {
    return PAGE_TYPES.RETURNS_OTHER;
  }
  if (/order-details$/.test(path) || /\/css\/summary\/edit/.test(path) || /\/your-account\/order-details/.test(path)) {
    return PAGE_TYPES.ORDER_DETAILS;
  }
  if (
    /order-history$/.test(path) ||
    path === '/your-orders/orders' ||
    path === '/your-orders' ||
    /\/your-account\/order-history/.test(path)
  ) {
    return PAGE_TYPES.ORDERS_LIST;
  }
  return PAGE_TYPES.UNKNOWN;
}

/**
 * Reads the order id from the query string. Amazon uses both `orderID` and
 * `orderId` depending on the page.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function getOrderIdFromUrl(url) {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  for (const key of ['orderID', 'orderId', 'orderid', 'oid']) {
    const value = parsed.searchParams.get(key);
    if (value && isOrderId(value)) return value;
  }
  return null;
}

/**
 * Reads the order line item id (`itemId` / `lineItemId`) from the query string.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function getLineItemIdFromUrl(url) {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  for (const key of ['lineItemId', 'itemId', 'itemID']) {
    const value = parsed.searchParams.get(key);
    if (value && isLineItemId(value)) return value;
  }
  return null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isOrderId(value) {
  return ORDER_ID.test(String(value || '').trim());
}

/** Shape of an Amazon order id. */
export const ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

/** Order line item ids are opaque lowercase alphanumeric tokens. */
const LINE_ITEM_ID = /^[a-z0-9]{8,40}$/;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isLineItemId(value) {
  return LINE_ITEM_ID.test(String(value || ''));
}

/**
 * Builds the order details URL for an order id on the current origin.
 *
 * @param {string} origin e.g. https://www.amazon.com
 * @param {string} orderId
 * @returns {string}
 */
export function orderDetailsUrl(origin, orderId) {
  return `${origin}/your-orders/order-details?orderID=${encodeURIComponent(orderId)}`;
}

/**
 * Builds the product page URL for an ASIN on the current origin.
 *
 * @param {string} origin
 * @param {string} asin
 * @returns {string}
 */
export function productUrl(origin, asin) {
  return `${origin}/dp/${encodeURIComponent(asin)}`;
}

/**
 * The marketplace a page belongs to, used to keep cached data per site.
 *
 * @param {string} origin
 * @returns {string} e.g. "amazon.de"
 */
export function marketplaceOf(origin) {
  const parsed = safeUrl(origin);
  const host = parsed ? parsed.hostname : String(origin || '');
  return host.toLowerCase().replace(/^(www|smile|sellercentral)\./, '') || 'unknown';
}

/** Matches a 10 character ASIN inside a product path. Keep PRODUCT_LINK_SELECTOR in selectors.js in step. */
const ASIN_IN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d|dp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

/**
 * Extracts an ASIN from a product link.
 *
 * @param {string} href absolute or relative URL
 * @returns {string|null}
 */
export function asinFromHref(href) {
  if (!href) return null;
  const match = ASIN_IN_PATH.exec(String(href));
  return match ? match[1].toUpperCase() : null;
}
