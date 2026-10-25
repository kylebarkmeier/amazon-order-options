/**
 * Last-resort extraction of a size from the product title. Many listings put
 * the variation at the end of the title, e.g.
 *   "Care Bears Cheer Bear Romper Women's Costume - M"
 *   "... Fleece Romper - Medium - Green"
 *   "... Costume Pajama Outfit (Small/Medium)"
 * This is only used when neither the page nor the product data gives an
 * answer, and the result is labelled as coming from the title.
 */

import { dedupeByLabel } from './text.js';

const SIZE_WORDS =
  '(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|[2-4]XS|X-Small|XX-Small|XXX-Small|Small|Medium|Large|X-Large|XX-Large|XXX-Large|One Size|OS|Plus|Petite|Tall|Regular|Short|Long)';
const SIZE_TOKEN = new RegExp(`^${SIZE_WORDS}(?:\\s*/\\s*${SIZE_WORDS})?$`, 'i');
const NUMERIC_SIZE = /^\d{1,2}(?:\.\d)?\s*(?:[A-Z]{0,2}\s*)?(?:Women|Men|Kids|Youth|Toddler|Infant|Big Kid|Little Kid)?(?:\s*\/\s*\d{1,2}(?:\.\d)?\s*(?:Women|Men|Kids|Youth)?)?$/i;
const QUANTITY = /^(?:Pack of \d+|\d+[- ]?Pack|\d+ Count|\d+ ?(?:ct|pcs|pieces|pc))$/i;
const MEASURE = /^\d+(?:\.\d+)?\s*(?:fl\.? ?oz|oz|ml|l|lb|lbs|kg|g|in|inch|inches|ft|cm|mm|"|'|mAh|W|V|GB|TB)(?:\s*\(.*\))?$/i;

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 */

/**
 * @param {string} segment
 * @returns {string|null} label for a recognised option value
 */
export function classifySegment(segment) {
  const s = String(segment || '').trim();
  if (!s) return null;
  // A lone lowercase letter is never a size on its own (the "s" of "Sizes").
  if (/^[a-z]$/.test(s)) return null;
  if (SIZE_TOKEN.test(s) || NUMERIC_SIZE.test(s)) return 'Size';
  if (QUANTITY.test(s)) return 'Pack';
  if (MEASURE.test(s)) return 'Size';
  return null;
}

/**
 * @param {string|null|undefined} title
 * @returns {OptionPair[]}
 */
export function extractOptionsFromTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const pairs = [];

  // Explicit "Size: M" / "Size M" anywhere in the title. "Sizes 6-12" does not count.
  const explicit = /\b(?:Size|Sz)\b\s*:?\s*([A-Za-z0-9./-]{1,12})\b/i.exec(text);
  if (explicit && classifySegment(explicit[1])) pairs.push({ label: 'Size', value: explicit[1] });

  // Trailing " - X - Y" or ", X" segments, ignoring a parenthetical tail which is handled below.
  const dashParts = text.split(/\s+[-–—|]\s+|\s*[,|]\s+/);
  if (dashParts.length > 1) {
    for (const part of dashParts.slice(1).reverse()) {
      const segment = part.replace(/\s*\([^()]*\)\s*$/, '').trim();
      const label = classifySegment(segment);
      if (label) pairs.push({ label, value: segment });
    }
  }

  // Parenthesised sizes such as "(Small/Medium)" or "(Pack of 2)".
  for (const match of text.matchAll(/\(([^()]{1,40})\)/g)) {
    const label = classifySegment(match[1]);
    if (label) pairs.push({ label, value: match[1].trim() });
  }

  return dedupeByLabel(pairs);
}
