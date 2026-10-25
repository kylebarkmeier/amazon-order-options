import { asinFromHref, PAGE_TYPES, isLineItemId } from './page-detector.js';
import { imageIdFromImg } from './image-id.js';
import { collectHints, isMetadataLabel, isOptionLabel } from './dom-hints.js';
import { EXCLUDED_SELECTOR, HIDDEN_SELECTOR, PRODUCT_LINK_SELECTOR } from './selectors.js';
import { fullText, TRUNCATED_TITLE } from './text.js';

/**
 * Finds the "item cards" on a page: one element per purchased item, together
 * with the data needed to look up its options.
 *
 * Amazon's markup differs between the orders list, order details, the return
 * cart, the return status page and the mobile site, so the scan is based on
 * what every item has in common: a product image with an Amazon image id, and
 * a title next to it. The card is the smallest ancestor of the image that
 * holds a title and no second product image.
 */

/** Ancestors that may be an item card. Element.matches treats the list as a union; order carries no priority. */
export const CARD_SELECTOR = [
  '.a-fixed-left-grid',
  '.item-box',
  '.orc-item',
  '.orc-returnable-item-details',
  '.a-box-inner',
  '.a-section.a-spacing-base',
  '.a-row',
  'li',
  'tr',
].join(', ');

const ORDER_ID_IN_TEXT = /\b\d{3}-\d{7}-\d{7}\b/g;

/**
 * @typedef {Object} CardInfo
 * @property {Element} element the card container
 * @property {Element} anchorPoint element the badge is inserted after (or into, for table cells)
 * @property {string|null} asin
 * @property {string|null} imageId
 * @property {string|null} title
 * @property {string|null} orderId
 * @property {string|null} lineItemId Amazon's order line item id when the page exposes it
 * @property {import('./variation-parser.js').OptionPair[]} hints
 * @property {Element|null} truncatedTitle element whose text should be replaced by the full title
 */

/**
 * @param {Document} doc
 * @param {string} pageType one of PAGE_TYPES
 * @param {{orderId?: string|null, lineItemId?: string|null, skip?: (card: Element) => boolean}} [context]
 * @returns {CardInfo[]}
 */
export function findItemCards(doc, pageType, context = {}) {
  const results = [];
  const used = new Set();
  const root = doc.querySelector('#a-page') || doc.body;
  if (!root) return results;

  // A single-order page may state the order id once, outside the cards. The
  // returns-centre home page lists many orders, so it is not one of these.
  const singleOrderPage = [PAGE_TYPES.ORDER_DETAILS, PAGE_TYPES.RETURNS_CART, PAGE_TYPES.RETURNS_PREP].includes(pageType);
  const pageOrderId = context.orderId || (singleOrderPage ? uniqueOrderIdIn(root) : null);

  for (const img of root.querySelectorAll('img')) {
    const imageId = imageIdFromImg(img);
    if (!imageId) continue;
    if (img.closest(EXCLUDED_SELECTOR) || img.closest(HIDDEN_SELECTOR)) continue;

    const found = pickCard(img);
    if (!found || used.has(found.card)) continue;
    used.add(found.card);
    if (context.skip && context.skip(found.card)) continue;

    const { card, titleInfo } = found;
    const probe = { imageId, title: titleInfo.title };
    results.push({
      element: card,
      anchorPoint: titleInfo.anchorPoint,
      asin: titleInfo.asin || asinFromImageLink(img),
      imageId,
      title: titleInfo.title,
      orderId: pageType === PAGE_TYPES.UNKNOWN ? null : findOrderIdFor(card) || pageOrderId,
      lineItemId: findLineItemIdFor(card),
      hints: collectHints(card, probe),
      truncatedTitle: titleInfo.truncatedTitle,
    });
  }

  // A page about one line item (return cart or status reached from an order) names it in the URL.
  if (results.length === 1 && context.lineItemId && !results[0].lineItemId) results[0].lineItemId = context.lineItemId;
  return results;
}

/**
 * Walks up from the image to the smallest candidate ancestor that holds a
 * title. An ancestor holding a second product image is a group of items, not
 * a card, and ends the walk.
 *
 * @param {Element} img
 * @returns {{card: Element, titleInfo: ReturnType<typeof findTitle>}|null}
 */
function pickCard(img) {
  let node = img.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    if (!node.matches(CARD_SELECTOR)) continue;
    if (countProductImages(node) > 1) return null;
    const titleInfo = findTitle(node, img);
    if (titleInfo) return { card: node, titleInfo };
  }
  return null;
}

/**
 * @param {Element} node
 * @returns {number}
 */
function countProductImages(node) {
  let count = 0;
  for (const img of node.querySelectorAll('img')) {
    if (!imageIdFromImg(img) || img.closest(HIDDEN_SELECTOR) || img.closest(EXCLUDED_SELECTOR)) continue;
    count += 1;
    if (count > 1) break;
  }
  return count;
}

const TEXT_TITLE_SELECTORS = ['h4', 'h3', '.a-truncate', '.a-text-bold', '[class*="title"]', '.a-size-base', '.a-size-medium', 'span', 'div'];

/**
 * @param {Element} card
 * @param {Element} img
 * @returns {{title: string, asin: string|null, anchorPoint: Element, truncatedTitle: Element|null}|null}
 */
function findTitle(card, img) {
  const linkSelectors = ['[data-component="itemTitle"] a[href]', '.yohtmlc-product-title a[href]', PRODUCT_LINK_SELECTOR];
  for (const selector of linkSelectors) {
    for (const link of card.querySelectorAll(selector)) {
      if (link.closest(EXCLUDED_SELECTOR) || link.closest(HIDDEN_SELECTOR)) continue;
      const title = fullText(link);
      if (title.length >= 8) {
        return {
          title,
          asin: asinFromHref(link.getAttribute('href')),
          anchorPoint: anchorFor(link, card),
          truncatedTitle: truncatedElement(link, title),
        };
      }
    }
  }

  for (const selector of TEXT_TITLE_SELECTORS) {
    for (const el of card.querySelectorAll(selector)) {
      if (el.contains(img) || el.closest(EXCLUDED_SELECTOR) || el.closest(HIDDEN_SELECTOR)) continue;
      if (el.closest('.a-button, button, select, label')) continue;
      const title = fullText(el);
      if (title.length < 12 || looksLikeMetadataRow(title) || /^[$€£¥₹]/.test(title)) continue;
      return {
        title,
        asin: null,
        anchorPoint: anchorFor(el, card),
        truncatedTitle: truncatedElement(el, title),
      };
    }
  }
  return null;
}

/**
 * "Quantity: 1" and "Size: M" are rows, "Spider-Man: No Way Home" is a title.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeMetadataRow(text) {
  const match = /^([^:]{1,40}):\s*\S/.exec(text);
  if (!match) return false;
  return isOptionLabel(match[1]) || isMetadataLabel(match[1]);
}

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

const BLOCK_TAGS = /^(DIV|LI|P|H[1-6]|TD|TH|DD|DT|SECTION|ARTICLE)$/;

/**
 * The element to place the badge after: the title's nearest block ancestor
 * below the card that is not inside a link, so the badge never becomes link
 * content. For a link-wrapped card this is the link itself.
 *
 * @param {Element} el
 * @param {Element} card
 * @returns {Element}
 */
function anchorFor(el, card) {
  let node = el;
  while (node.parentElement && node.parentElement !== card) {
    const enclosingLink = node.parentElement.closest('a');
    const insideLink = enclosingLink && card.contains(enclosingLink);
    if (BLOCK_TAGS.test(node.tagName) && !insideLink) return node;
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
 * The order id of a card: on the card, else on the order group it sits in.
 * A container that mentions several orders gives no answer.
 *
 * @param {Element} card
 * @returns {string|null}
 */
function findOrderIdFor(card) {
  const own = uniqueOrderIdIn(card);
  if (own) return own;
  for (const selector of ['.order-card', '.js-order-card', '.a-box-group', '.item-return-history-card', '.a-box']) {
    const group = card.closest(selector);
    if (!group) continue;
    const ids = orderIdsIn(group);
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) return null;
  }
  return null;
}

/**
 * @param {Element} root
 * @returns {string[]} distinct order ids in document order
 */
export function orderIdsIn(root) {
  return [...new Set((root.textContent || '').match(ORDER_ID_IN_TEXT) || [])];
}

/**
 * @param {Element} root
 * @returns {string|null} the order id when the text names exactly one
 */
export function uniqueOrderIdIn(root) {
  const ids = orderIdsIn(root);
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Return pages carry the order line item id in the ids Amazon gives the
 * card's "Details" popover and container.
 *
 * @param {Element} card
 * @returns {string|null}
 */
export function findLineItemIdFor(card) {
  const popover = card.querySelector('[id^="a-popover-"][id*="itemDetails"]');
  if (popover) {
    const match = /^a-popover-([a-z0-9]+)-/.exec(popover.id);
    if (match && isLineItemId(match[1])) return match[1];
  }
  const orcItem = card.closest('.orc-item[id]') || card.querySelector('.orc-item[id]');
  if (orcItem) {
    const match = /^([a-z0-9]+)-/.exec(orcItem.id);
    if (match && isLineItemId(match[1])) return match[1];
  }
  const keyed = card.closest('[data-item-key]') || card.querySelector('[data-item-key]');
  if (keyed) {
    const first = (keyed.getAttribute('data-item-key') || '').split('-')[0];
    if (isLineItemId(first)) return first;
  }
  return null;
}
