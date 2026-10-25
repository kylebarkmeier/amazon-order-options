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

/** Amazon retail hostnames the extension runs on. */
export const AMAZON_HOST_PATTERN =
  /(^|\.)amazon\.(com|co\.uk|de|ca|fr|it|es|co\.jp|com\.au|in|com\.mx|com\.br|nl|se|pl|sg|ae|sa|com\.tr|eg|com\.be|ie)$/i;

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
 * @param {string} url
 * @returns {string} one of PAGE_TYPES
 */
export function detectPageType(url) {
  const parsed = safeUrl(url);
  if (!parsed || !isAmazonHost(parsed.hostname)) return PAGE_TYPES.UNKNOWN;

  const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();

  if (/^\/your-returns$/.test(path) || /\/css\/returns\/(history|list)/.test(path)) {
    return PAGE_TYPES.YOUR_RETURNS;
  }
  if (/^\/spr\/returns\/cart$/.test(path)) return PAGE_TYPES.RETURNS_CART;
  if (/^\/spr\/returns\/(prep|confirmation|summary|label|status)/.test(path)) {
    return PAGE_TYPES.RETURNS_PREP;
  }
  if (/^\/spr\/returns/.test(path) || /\/css\/returns\//.test(path) || /^\/returns\b/.test(path)) {
    return PAGE_TYPES.RETURNS_OTHER;
  }
  if (/order-details$/.test(path) || /\/css\/summary\/edit/.test(path) || /\/your-account\/order-details/.test(path)) {
    return PAGE_TYPES.ORDER_DETAILS;
  }
  if (
    /order-history$/.test(path) ||
    /^\/your-orders\/orders$/.test(path) ||
    /^\/your-orders$/.test(path) ||
    /\/your-account\/order-history/.test(path) ||
    /^\/gp\/your-account\/order-history/.test(path)
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
 * @param {string} value
 * @returns {boolean}
 */
export function isOrderId(value) {
  return /^\d{3}-\d{7}-\d{7}$/.test(String(value || '').trim());
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

/** Matches a 10 character ASIN inside a product path. */
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
