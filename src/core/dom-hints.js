import { cleanLabel } from './variation-parser.js';
import { imageIdFromElement } from './image-id.js';
import { normalizeTitle } from './order-page-parser.js';

/**
 * Amazon's return pages often already contain the selected options, but hide
 * them inside a "Details" popover or a collapsed block. These helpers read
 * those "Label: value" pairs so they can be shown next to the item.
 */

/** Labels that describe the order, not the item's variation. */
const IGNORED_LABELS = new Set(
  [
    'order #',
    'order',
    'order number',
    'order id',
    'sold by',
    'seller',
    'ships from',
    'shipped from',
    'quantity',
    'qty',
    'item price',
    'price',
    'total',
    'subtotal',
    'condition',
    'return window',
    'return by',
    'eligible through',
    'delivered',
    'arriving',
    'status',
    'refund',
    'tracking id',
    'tracking',
    'rma',
    'asin',
    'sku',
    'return reason',
    'reason',
    'comments',
    'location',
    'drop off by',
    'quantity returned',
  ].map((s) => s.toLowerCase()),
);

/** Any label containing one of these words describes the order, not the item. */
const IGNORED_LABEL_WORDS =
  /\b(return|replace|eligible|deliver|arriv|order|ship|track|refund|price|total|quantity|qty|sold|seller|invoice|payment|status|window|request|cancel|feedback|review|support|gift|subscri)/i;

/** Labels that are known to describe a variation. Used to rank hints. */
export const KNOWN_OPTION_LABELS = new Set(
  [
    'size',
    'color',
    'colour',
    'style',
    'pattern',
    'fit',
    'fit type',
    'material',
    'flavor',
    'flavour',
    'scent',
    'package quantity',
    'number of items',
    'unit count',
    'count',
    'team',
    'model',
    'edition',
    'format',
    'configuration',
    'platform',
    'capacity',
    'length',
    'width',
    'height',
    'shape',
    'finish',
    'design',
    'option',
    'variant',
    'set',
    'bundle',
    'pack',
    'type',
    'band',
    'band size',
    'cup size',
    'waist',
    'inseam',
    'neck',
    'sleeve',
    'shoe size',
    'ring size',
    'frame',
    'lens',
    'storage',
    'memory',
    'carrier',
    'connectivity',
    'wattage',
    'voltage',
  ].map((s) => s.toLowerCase()),
);

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 */

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isOptionLabel(label) {
  const key = cleanLabel(label).toLowerCase();
  if (!key || key.length > 40) return false;
  if (IGNORED_LABELS.has(key)) return false;
  if (KNOWN_OPTION_LABELS.has(key)) return true;
  return !IGNORED_LABEL_WORDS.test(key);
}

/**
 * Reads "Label:" / "value" span pairs, and "Label: value" single text nodes,
 * from the subtree.
 *
 * @param {Element|Document|null} root
 * @returns {OptionPair[]}
 */
export function extractLabelValuePairs(root) {
  const pairs = [];
  if (!root || !root.querySelectorAll) return pairs;
  const seen = new Set();
  const push = (label, value) => {
    const l = cleanLabel(label);
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    if (!l || !v || v.length > 80 || !isOptionLabel(l)) return;
    const key = `${l.toLowerCase()}=${v.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ label: l, value: v });
  };

  // Leaf elements whose own text is "Label:" followed by a sibling leaf with the value.
  const leaves = [...root.querySelectorAll('span, div, td, dt, b, strong, li, p')].filter(
    (el) => el.children.length === 0 || onlyInlineChildren(el),
  );
  for (const el of leaves) {
    if (el.closest('.aoo-badge')) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const inline = /^([^:\n]{1,40}):\s+(.{1,80})$/.exec(text);
    if (inline && !/^https?:/i.test(inline[2])) {
      push(inline[1], inline[2]);
      continue;
    }

    if (/^[^:\n]{1,40}:$/.test(text)) {
      const next = nextLeafSibling(el);
      if (next) push(text.slice(0, -1), next.textContent);
    }
  }
  return pairs;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function onlyInlineChildren(el) {
  for (const child of el.children) {
    if (!/^(B|STRONG|I|EM|SPAN)$/.test(child.tagName) || child.children.length > 0) return false;
  }
  return true;
}

/**
 * @param {Element} el
 * @returns {Element|null}
 */
function nextLeafSibling(el) {
  let next = el.nextElementSibling;
  while (next && next.textContent.trim() === '') next = next.nextElementSibling;
  if (next && next.textContent.trim()) return next;
  // Some layouts put the value in a sibling of the parent row.
  const parentNext = el.parentElement && el.parentElement.nextElementSibling;
  if (parentNext && parentNext.children.length <= 1 && parentNext.textContent.trim()) return parentNext;
  return null;
}

/**
 * Finds hidden detail blocks related to an item card: popover preloads inside
 * the card, or page-level hidden blocks whose image or title matches.
 *
 * @param {Element} card
 * @param {{imageId?: string|null, title?: string|null}} probe
 * @returns {Element[]}
 */
export function findHiddenDetailBlocks(card, probe) {
  const blocks = new Set();
  if (!card) return [];
  for (const el of card.querySelectorAll('.a-popover-preload, .aok-hidden, [hidden], [id^="single-item-details-content"]')) {
    blocks.add(el);
  }
  const doc = card.ownerDocument;
  if (doc) {
    const candidates = doc.querySelectorAll(
      '.a-popover-preload[id*="itemDetails"], [id^="single-item-details-content"], [id*="item-details"][class*="hidden"]',
    );
    const title = normalizeTitle(probe.title).slice(0, 25);
    for (const el of candidates) {
      if (card.contains(el)) continue;
      const imageId = imageIdFromElement(el);
      if (probe.imageId && imageId && imageId === probe.imageId) {
        blocks.add(el);
        continue;
      }
      if (title.length >= 12 && normalizeTitle(el.textContent).includes(title)) blocks.add(el);
    }
  }
  return [...blocks];
}

/**
 * Collects option hints for a card from the card itself and its hidden blocks.
 *
 * @param {Element} card
 * @param {{imageId?: string|null, title?: string|null}} probe
 * @returns {OptionPair[]}
 */
export function collectHints(card, probe) {
  const pairs = [];
  const seen = new Set();
  const add = (list) => {
    for (const pair of list) {
      const key = pair.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(pair);
    }
  };
  add(extractLabelValuePairs(card));
  for (const block of findHiddenDetailBlocks(card, probe)) add(extractLabelValuePairs(block));
  return pairs.sort((a, b) => rank(b) - rank(a));
}

/**
 * @param {OptionPair} pair
 * @returns {number}
 */
function rank(pair) {
  const key = pair.label.toLowerCase();
  if (key === 'size') return 3;
  if (key === 'color' || key === 'colour') return 2;
  return KNOWN_OPTION_LABELS.has(key) ? 1 : 0;
}
