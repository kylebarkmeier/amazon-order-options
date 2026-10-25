import { asinFromHref, getLineItemIdFromUrl } from './page-detector.js';
import { imageIdFromElement } from './image-id.js';
import { EXCLUDED_SELECTOR, PRODUCT_LINK_SELECTOR } from './selectors.js';
import { fullText, normalizeTitle } from './text.js';

/**
 * @typedef {Object} OrderItem
 * @property {string} asin child ASIN of the purchased variation
 * @property {string} title full product title
 * @property {string|null} imageId Amazon image id, see image-id.js (per colour, not per size)
 * @property {string[]} lineItemIds Amazon's order line item ids for this item, when the page links them
 */

/** Ancestors that group an item's image, title and links, most specific first. */
const CONTAINER_SELECTORS = ['.a-fixed-left-grid', '.item-box', '[data-component="purchasedItems"] > div', '.a-box', 'li', '.a-row'];

/**
 * Parses the items on an order details (or orders list) page.
 *
 * Works on both the newer markup, which tags pieces with `data-component`,
 * and the older markup, which uses `yohtmlc-product-title` and
 * `product-image`. Falls back to scanning product links.
 *
 * The order details page links each item to `/your-orders/pop?…&lineItemId=…&asin=…`,
 * which gives the line item id that return pages also expose.
 *
 * @param {Document|Element} root parsed document
 * @returns {OrderItem[]}
 */
export function parseOrderItems(root) {
  if (!root || !root.querySelectorAll) return [];
  const items = new Map();

  const titleAnchors = [
    ...root.querySelectorAll('[data-component="itemTitle"] a[href], .yohtmlc-product-title a[href]'),
  ];
  const seen = new Set(titleAnchors);
  for (const anchor of root.querySelectorAll(PRODUCT_LINK_SELECTOR)) {
    if (!seen.has(anchor) && anchor.textContent.trim().length > 0 && !anchor.closest(EXCLUDED_SELECTOR)) {
      titleAnchors.push(anchor);
    }
  }

  for (const anchor of titleAnchors) {
    const container = findContainer(anchor);
    const asin = asinFromHref(anchor.getAttribute('href')) || asinFromLinks(container);
    const title = fullText(anchor);
    if (!asin || !title) continue;
    const imageId = (container && imageIdFromElement(container)) || imageIdFromProductLink(anchor.ownerDocument, asin);
    const lineItemIds = container ? lineItemIdsIn(container) : [];
    const key = `${asin}|${imageId || ''}`;
    const existing = items.get(key);
    if (existing) {
      for (const id of lineItemIds) if (!existing.lineItemIds.includes(id)) existing.lineItemIds.push(id);
    } else {
      items.set(key, { asin, title, imageId, lineItemIds });
    }
  }

  return [...items.values()];
}

/**
 * @param {Element} anchor
 * @returns {Element|null}
 */
function findContainer(anchor) {
  for (const selector of CONTAINER_SELECTORS) {
    const container = anchor.closest(selector);
    if (container && container.querySelector('img')) return container;
  }
  return anchor.closest(CONTAINER_SELECTORS[0]) || anchor.parentElement;
}

/**
 * @param {Element|null} container
 * @returns {string|null}
 */
function asinFromLinks(container) {
  if (!container) return null;
  for (const link of container.querySelectorAll('a[href*="asin="]')) {
    try {
      const value = new URL(link.href, 'https://www.amazon.com').searchParams.get('asin');
      if (value && /^[A-Z0-9]{10}$/i.test(value)) return value.toUpperCase();
    } catch {
      // ignore malformed links
    }
  }
  return null;
}

/**
 * @param {Element} container
 * @returns {string[]}
 */
function lineItemIdsIn(container) {
  const ids = new Set();
  for (const link of container.querySelectorAll('a[href*="lineItemId="], a[href*="itemId="]')) {
    let href = link.getAttribute('href') || '';
    try {
      href = new URL(href, 'https://www.amazon.com').href;
    } catch {
      continue;
    }
    const id = getLineItemIdFromUrl(href);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * When the title's container has no image, an image link pointing at the same
 * ASIN elsewhere on the page is accepted.
 *
 * @param {Document|null} doc
 * @param {string} asin
 * @returns {string|null}
 */
function imageIdFromProductLink(doc, asin) {
  if (!doc) return null;
  for (const anchor of doc.querySelectorAll(PRODUCT_LINK_SELECTOR)) {
    if (asinFromHref(anchor.getAttribute('href')) !== asin) continue;
    const id = imageIdFromElement(anchor);
    if (id) return id;
  }
  return null;
}

/**
 * Picks the order item for a card seen on another page.
 *
 * The line item id is an exact key. The image id identifies the colour only,
 * so when several items share it the title has to tell them apart; when it
 * cannot (truncated titles), no guess is made. The title prefix is the last
 * resort and must be a clear winner.
 *
 * @param {OrderItem[]} items
 * @param {{lineItemId?: string|null, imageId?: string|null, title?: string|null}} probe
 * @returns {OrderItem|null}
 */
export function matchOrderItem(items, probe) {
  if (!items || items.length === 0) return null;

  if (probe.lineItemId) {
    const exact = items.find((item) => item.lineItemIds && item.lineItemIds.includes(probe.lineItemId));
    if (exact) return exact;
  }

  const title = normalizeTitle(probe.title);

  if (probe.imageId) {
    const byImage = items.filter((item) => item.imageId === probe.imageId);
    if (byImage.length === 1) return byImage[0];
    if (byImage.length > 1) {
      const byTitle = title ? byImage.filter((item) => normalizeTitle(item.title) === title) : [];
      return byTitle.length === 1 ? byTitle[0] : null;
    }
  }

  if (!title) return null;
  let best = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const item of items) {
    const score = sharedPrefixLength(title, normalizeTitle(item.title));
    if (score > bestScore) {
      runnerUp = bestScore;
      best = item;
      bestScore = score;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  // At least 12 shared characters, the whole probe when it is shorter than 20, and a clear winner.
  if (bestScore < Math.max(12, Math.min(20, title.length)) || bestScore === runnerUp) return null;
  return best;
}

export { normalizeTitle };

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function sharedPrefixLength(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}
