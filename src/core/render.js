/**
 * Builds the badge that is inserted under an item title.
 */

export const BADGE_CLASS = 'aoo-badge';
export const STYLE_ID = 'aoo-styles';

export const CSS = `
.${BADGE_CLASS} {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 4px 0 2px;
  font-size: 13px;
  line-height: 1.35;
  font-family: inherit;
  color: #0f1111;
}
.${BADGE_CLASS}[data-aoo-style="plain"] { gap: 2px 10px; }
.${BADGE_CLASS} .aoo-pair {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 10px;
  background: #fff3cd;
  border: 1px solid #f1c232;
  white-space: nowrap;
  max-width: 100%;
}
.${BADGE_CLASS}[data-aoo-style="plain"] .aoo-pair {
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 0;
}
.${BADGE_CLASS} .aoo-label { color: #565959; }
.${BADGE_CLASS} .aoo-label::after { content: ':'; }
.${BADGE_CLASS} .aoo-value { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.${BADGE_CLASS} .aoo-source {
  font-size: 11px;
  color: #767676;
  align-self: center;
}
.${BADGE_CLASS}[data-aoo-source="title"] .aoo-pair { background: #eef3fb; border-color: #9fb9e2; }
@media (prefers-color-scheme: dark) {
  .${BADGE_CLASS} { color: #e3e6e6; }
  .${BADGE_CLASS} .aoo-pair { background: #4a3b00; border-color: #c59a00; }
  .${BADGE_CLASS}[data-aoo-source="title"] .aoo-pair { background: #1d2b44; border-color: #4a6fa8; }
  .${BADGE_CLASS} .aoo-label { color: #c7cbcb; }
  .${BADGE_CLASS} .aoo-source { color: #a7abab; }
}
@media (max-width: 480px) {
  .${BADGE_CLASS} { font-size: 12px; }
  .${BADGE_CLASS} .aoo-pair { white-space: normal; }
}
`;

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 */

/**
 * Injects the stylesheet once per document.
 *
 * @param {Document} doc
 */
export function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * @param {OptionPair[]} options
 * @returns {string} "Size: M · Color: Pink"
 */
export function formatOptions(options) {
  return (options || []).map((o) => `${o.label}: ${o.value}`).join(' · ');
}

/**
 * @param {Document} doc
 * @param {OptionPair[]} options
 * @param {{source?: string, style?: 'highlight'|'plain', showSource?: boolean}} [opts]
 * @returns {HTMLElement}
 */
export function createBadge(doc, options, opts = {}) {
  const badge = doc.createElement('div');
  badge.className = BADGE_CLASS;
  badge.setAttribute('data-aoo-source', opts.source || 'page');
  badge.setAttribute('data-aoo-style', opts.style === 'plain' ? 'plain' : 'highlight');
  badge.setAttribute('role', 'note');
  badge.setAttribute('aria-label', `Selected options: ${formatOptions(options)}`);
  badge.title = formatOptions(options);

  for (const option of options) {
    const pair = doc.createElement('span');
    pair.className = 'aoo-pair';
    const label = doc.createElement('span');
    label.className = 'aoo-label';
    label.textContent = option.label;
    const value = doc.createElement('span');
    value.className = 'aoo-value';
    value.textContent = option.value;
    pair.append(label, value);
    badge.appendChild(pair);
  }

  if (opts.showSource && opts.source === 'title') {
    const note = doc.createElement('span');
    note.className = 'aoo-source';
    note.textContent = '(from title)';
    badge.appendChild(note);
  }
  return badge;
}

/**
 * Inserts the badge directly after the anchor element, replacing any badge
 * already there.
 *
 * @param {Element} anchorPoint
 * @param {HTMLElement} badge
 */
export function placeBadge(anchorPoint, badge) {
  const existing = anchorPoint.parentElement
    ? anchorPoint.parentElement.querySelector(`:scope > .${BADGE_CLASS}`)
    : null;
  if (existing) existing.remove();
  anchorPoint.insertAdjacentElement('afterend', badge);
}
