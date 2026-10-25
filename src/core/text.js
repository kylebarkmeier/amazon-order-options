/**
 * Text helpers shared across modules.
 */

/** Matches a title Amazon cut short. */
export const TRUNCATED_TITLE = /(\.{3}|…)$/;

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prefers the untruncated copy of an element's text when Amazon provides one
 * (`.a-truncate-full` next to `.a-truncate-cut`).
 *
 * @param {Element} el
 * @returns {string}
 */
export function fullText(el) {
  const full = el.querySelector('.a-truncate-full');
  if (full && full.textContent.trim()) return collapseWhitespace(full.textContent);
  const cut = el.querySelector('.a-truncate-cut');
  if (cut && el.querySelectorAll('.a-truncate-cut').length === 1 && el.textContent.trim() === cut.textContent.trim()) {
    return collapseWhitespace(cut.textContent);
  }
  return collapseWhitespace(el.textContent);
}

/**
 * Normalizes a title for comparison: whitespace, a trailing ellipsis, case.
 *
 * @param {string|null|undefined} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  return collapseWhitespace(title).replace(TRUNCATED_TITLE, '').trim().toLowerCase();
}

/**
 * Removes label/value pairs that repeat a label, keeping the first. "Colour"
 * and "Color" count as the same label.
 *
 * @template {{label: string}} T
 * @param {T[]} pairs
 * @returns {T[]}
 */
export function dedupeByLabel(pairs) {
  const out = [];
  const seen = new Set();
  for (const pair of pairs || []) {
    const key = labelKey(pair.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

/**
 * @param {string} label
 * @returns {string}
 */
export function labelKey(label) {
  return collapseWhitespace(label)
    .replace(/\s*:\s*$/, '')
    .toLowerCase()
    .replace(/colour/, 'color');
}
