import { asinFromHref, PAGE_TYPES, isOrderId } from './page-detector.js';
import { extractImageId, imageIdFromElement } from './image-id.js';
import { collectHints } from './dom-hints.js';

/**
 * Finds the "item cards" on a page: one element per purchased item, together
 * with the data needed to look up its options.
 *
 * Amazon's markup differs between the orders list, order details, the return
 * cart, the return status page and the mobile site, so the scan is based on
 * what every item has in common: a product image with an Amazon image id, and
 * a title that is either a link to /dp/ASIN or a bold text next to the image.
 */

/** Containers that hold recommendations, navigation or the cart rail. */
export const EXCLUDED_SELECTOR = [
  '#nav-belt',
  '#navbar',
  '#nav-main',
  '#navFooter',
  '.ewc-content',
  '#ewc',
  '#rhf',
  '#rhf-container',
  '[data-a-carousel-options]',
  '.a-carousel-container',
  '#rufus-plus-button-menu-items-container',
  '[cel_widget_id*="recommend"]',
  '[cel_widget_id*="buy-again"]',
  '[cel_widget_id*="similarities"]',
  '[data-component="buyAgain"]',
  '.a-popover-preload',
  '#items-summary-section',
  '#cart-items-images-v2',
  '.aoo-badge',
].join(', ');

const CARD_SELECTOR = [
  '.a-fixed-left-grid',
  '.item-box',
  '.orc-item',
  '.orc-returnable-item-details',
  '.item-return-history-card .a-row.a-grid-vertical-align',
  '.a-box-inner',
  '.a-row.a-grid-vertical-align',
  '.a-section.a-spacing-base',
  '.a-row',
  'li',
].join(', ');

/**
 * @typedef {Object} CardInfo
 * @property {Element} element the card container
 * @property {Element} anchorPoint where the badge should be inserted after
 * @property {string|null} asin
 * @property {string|null} imageId
 * @property {string|null} title
 * @property {string|null} orderId
 * @property {import('./variation-parser.js').OptionPair[]} hints
 * @property {Element|null} truncatedTitle an `.a-truncate-cut` element, if any
 */

/**
 * @param {Document} doc
 * @param {string} pageType one of PAGE_TYPES
 * @param {{orderId?: string|null}} [context]
 * @returns {CardInfo[]}
 */
export function findItemCards(doc, pageType, context = {}) {
  const results = [];
  const used = new Set();
  const root = doc.querySelector('#a-page') || doc.body;
  if (!root) return results;

  // A single-order page may only state the order id once, outside the cards.
  const singleOrderPage = [PAGE_TYPES.ORDER_DETAILS, PAGE_TYPES.RETURNS_CART, PAGE_TYPES.RETURNS_PREP, PAGE_TYPES.RETURNS_OTHER].includes(pageType);
  const pageOrderId = context.orderId || (singleOrderPage ? findOrderIdInText(root) : null);

  for (const img of root.querySelectorAll('img')) {
    const imageId = extractImageId(img.getAttribute('src') || img.getAttribute('data-src'));
    if (!imageId) continue;
    if (img.closest(EXCLUDED_SELECTOR)) continue;
    if (img.closest('.aok-hidden, [hidden]')) continue;

    const card = pickCard(img);
    if (!card || used.has(card)) continue;

    const titleInfo = findTitle(card, img);
    if (!titleInfo) continue;

    used.add(card);
    const probe = { imageId, title: titleInfo.title };
    results.push({
      element: card,
      anchorPoint: titleInfo.anchorPoint,
      asin: titleInfo.asin || asinFromImageLink(img),
      imageId,
      title: titleInfo.title,
      orderId: pageType === PAGE_TYPES.UNKNOWN ? null : findOrderIdFor(card) || pageOrderId,
      hints: collectHints(card, probe),
      truncatedTitle: titleInfo.truncatedTitle,
    });
  }
  return results;
}

/**
 * Walks up from the image to the smallest ancestor that also contains a title.
 *
 * @param {Element} img
 * @returns {Element|null}
 */
function pickCard(img) {
  let node = img.parentElement;
  let depth = 0;
  while (node && depth < 8) {
    if (node.matches(CARD_SELECTOR) && hasTitleText(node, img)) return node;
    node = node.parentElement;
    depth += 1;
  }
  return null;
}

/**
 * @param {Element} node
 * @param {Element} img
 * @returns {boolean}
 */
function hasTitleText(node, img) {
  const text = node.textContent.replace(/\s+/g, ' ').trim();
  if (text.length < 12) return false;
  // The card must contain something other than the image and its wrapper.
  const imgOwnText = (img.closest('a') || img).textContent.replace(/\s+/g, ' ').trim();
  return text.length > imgOwnText.length + 8;
}

/**
 * @param {Element} card
 * @param {Element} img
 * @returns {{title: string, asin: string|null, anchorPoint: Element, truncatedTitle: Element|null}|null}
 */
function findTitle(card, img) {
  const linkSelectors = [
    '[data-component="itemTitle"] a[href]',
    '.yohtmlc-product-title a[href]',
    'a.a-link-normal[href*="/dp/"]',
    'a[href*="/gp/product/"]',
    'a[href*="/dp/"]',
  ];
  for (const selector of linkSelectors) {
    for (const link of card.querySelectorAll(selector)) {
      if (link.contains(img) || link.closest(EXCLUDED_SELECTOR)) continue;
      const title = fullText(link);
      if (title.length >= 8) {
        return {
          title,
          asin: asinFromHref(link.getAttribute('href')),
          anchorPoint: blockAncestor(link, card),
          truncatedTitle: truncatedElement(link, title),
        };
      }
    }
  }

  const textSelectors = [
    'h4',
    'h3',
    '.a-truncate',
    '.a-text-bold',
    '[class*="title"]',
    '.a-size-base',
    '.a-size-medium',
    'span',
    'div',
  ];
  for (const selector of textSelectors) {
    for (const el of card.querySelectorAll(selector)) {
      if (el.contains(img) || el.closest(EXCLUDED_SELECTOR) || el.closest('.aok-hidden')) continue;
      if (el.closest('.a-button, button, select')) continue;
      const title = fullText(el);
      if (title.length < 12 || /:\s*\S/.test(title) || /^\$|^Quantity|^Qty/i.test(title)) continue;
      return {
        title,
        asin: null,
        anchorPoint: blockAncestor(el, card),
        truncatedTitle: truncatedElement(el, title),
      };
    }
  }
  return null;
}

/** Matches a title Amazon cut short. */
export const TRUNCATED_TITLE = /(\.{3}|…)$/;

/**
 * Returns the element whose text should be replaced when the full title
 * becomes known, or null when the title is already complete.
 *
 * @param {Element} el
 * @param {string} fullTitle
 * @returns {Element|null}
 */
function truncatedElement(el, fullTitle) {
  const cut = el.querySelector('.a-truncate-cut') || (el.classList.contains('a-truncate-cut') ? el : null);
  if (cut) return cut;
  if (TRUNCATED_TITLE.test(fullTitle)) return el;
  return null;
}

/**
 * Looks for the order id on the card, then on the order it belongs to.
 *
 * @param {Element} card
 * @returns {string|null}
 */
function findOrderIdFor(card) {
  const own = findOrderIdInText(card);
  if (own) return own;
  for (const selector of ['.order-card', '.js-order-card', '.a-box-group', '.item-return-history-card', '.a-box']) {
    const group = card.closest(selector);
    const id = group ? findOrderIdInText(group) : null;
    if (id) return id;
  }
  return null;
}

/**
 * Prefers the untruncated copy of the text when Amazon provides one.
 *
 * @param {Element} el
 * @returns {string}
 */
export function fullText(el) {
  const full = el.querySelector('.a-truncate-full');
  const source = full && full.textContent.trim() ? full : el;
  return source.textContent.replace(/\s+/g, ' ').trim();
}

/**
 * @param {Element} el
 * @param {Element} card
 * @returns {Element}
 */
function blockAncestor(el, card) {
  let node = el;
  while (node.parentElement && node.parentElement !== card) {
    const display = node.tagName;
    if (/^(DIV|LI|P|H[1-6]|TD)$/.test(display)) return node;
    node = node.parentElement;
  }
  return node;
}

/**
 * @param {Element} img
 * @returns {string|null}
 */
function asinFromImageLink(img) {
  const link = img.closest('a[href]');
  return link ? asinFromHref(link.getAttribute('href')) : null;
}

/**
 * @param {Element} root
 * @returns {string|null}
 */
export function findOrderIdInText(root) {
  const text = root.textContent || '';
  const match = /\b(\d{3}-\d{7}-\d{7})\b/.exec(text);
  return match && isOrderId(match[1]) ? match[1] : null;
}

export { imageIdFromElement };
