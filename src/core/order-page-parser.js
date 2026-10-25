import { asinFromHref } from './page-detector.js';
import { extractImageId } from './image-id.js';

/**
 * @typedef {Object} OrderItem
 * @property {string} asin child ASIN of the purchased variation
 * @property {string} title full product title
 * @property {string|null} imageId Amazon image id, see image-id.js
 */

/** Ancestors that group an item's image and title, most specific first. */
const CONTAINER_SELECTORS = ['.a-fixed-left-grid', '.item-box', '[data-component="purchasedItems"] > div', '.a-box', 'li', '.a-row'];

/**
 * Parses the items on an order details (or orders list) page.
 *
 * Works on both the newer markup, which tags pieces with `data-component`,
 * and the older markup, which uses `yohtmlc-product-title` and
 * `product-image`. Falls back to scanning product links.
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
  for (const anchor of root.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
    if (!seen.has(anchor) && anchor.textContent.trim().length > 0 && !isExcluded(anchor)) {
      titleAnchors.push(anchor);
    }
  }

  for (const anchor of titleAnchors) {
    const asin = asinFromHref(anchor.getAttribute('href'));
    const title = anchor.textContent.replace(/\s+/g, ' ').trim();
    if (!asin || !title) continue;
    const imageId = findImageId(anchor, asin);
    const key = `${asin}|${imageId || ''}`;
    if (!items.has(key)) items.set(key, { asin, title, imageId });
  }

  return [...items.values()];
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isExcluded(el) {
  return Boolean(
    el.closest(
      '#nav-belt, #navbar, #navFooter, .ewc-content, #ewc, [data-a-carousel-options], .a-carousel, #rhf, #rufus-plus-button-menu-items-container, .a-popover-preload',
    ),
  );
}

/**
 * Looks for the product image that belongs to the same item. The order page
 * keeps the image and title in the same grid, but when it does not, an image
 * link pointing at the same ASIN is also accepted.
 *
 * @param {Element} anchor the title link
 * @param {string} asin
 * @returns {string|null}
 */
function findImageId(anchor, asin) {
  for (const selector of CONTAINER_SELECTORS) {
    const container = anchor.closest(selector);
    if (!container) continue;
    for (const img of container.querySelectorAll('img')) {
      const id = extractImageId(img.getAttribute('src') || img.getAttribute('data-src'));
      if (id) return id;
    }
  }
  const doc = anchor.ownerDocument;
  if (!doc) return null;
  for (const anchor of doc.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
    if (asinFromHref(anchor.getAttribute('href')) !== asin) continue;
    const img = anchor.querySelector('img');
    const id = img ? extractImageId(img.getAttribute('src') || img.getAttribute('data-src')) : null;
    if (id) return id;
  }
  return null;
}

/**
 * Picks the order item that best matches a card seen on another page.
 * Image id wins; otherwise the longest shared title prefix wins, as long as
 * the overlap is meaningful.
 *
 * @param {OrderItem[]} items
 * @param {{imageId?: string|null, title?: string|null}} probe
 * @returns {OrderItem|null}
 */
export function matchOrderItem(items, probe) {
  if (!items || items.length === 0) return null;
  if (probe.imageId) {
    const byImage = items.find((item) => item.imageId === probe.imageId);
    if (byImage) return byImage;
  }
  const title = normalizeTitle(probe.title);
  if (!title) return null;
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const score = sharedPrefixLength(title, normalizeTitle(item.title));
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  // At least 12 shared characters, and the whole probe when it is shorter than 20.
  return bestScore >= Math.max(12, Math.min(20, title.length)) ? best : null;
}

/**
 * @param {string|null|undefined} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(…|\.\.\.)$/, '')
    .trim()
    .toLowerCase();
}

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
