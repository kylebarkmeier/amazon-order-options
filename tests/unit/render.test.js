import { describe, it, expect } from 'vitest';
import { createBadge, ensureStyles, formatOptions, placeBadge, BADGE_CLASS, STYLE_ID } from '../../src/core/render.js';

const options = [
  { label: 'Size', value: 'M' },
  { label: 'Color', value: 'Pink' },
];

describe('formatOptions', () => {
  it('joins pairs', () => {
    expect(formatOptions(options)).toBe('Size: M · Color: Pink');
    expect(formatOptions([])).toBe('');
    expect(formatOptions(undefined)).toBe('');
  });
});

describe('ensureStyles', () => {
  it('injects the stylesheet once', () => {
    document.head.innerHTML = '';
    ensureStyles(document);
    ensureStyles(document);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(STYLE_ID).textContent).toContain(`.${BADGE_CLASS}`);
  });

  it('falls back to the document element without a head', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.head.remove();
    ensureStyles(doc);
    expect(doc.getElementById(STYLE_ID)).not.toBeNull();
  });
});

describe('createBadge', () => {
  it('renders one pill per option with accessible text', () => {
    const badge = createBadge(document, options, { source: 'product' });
    expect(badge.className).toBe(BADGE_CLASS);
    expect(badge.getAttribute('data-aoo-source')).toBe('product');
    expect(badge.getAttribute('data-aoo-style')).toBe('highlight');
    expect(badge.getAttribute('aria-label')).toBe('Selected options: Size: M · Color: Pink');
    expect(badge.title).toBe('Size: M · Color: Pink');
    const pairs = badge.querySelectorAll('.aoo-pair');
    expect(pairs).toHaveLength(2);
    expect(pairs[0].querySelector('.aoo-label').textContent).toBe('Size');
    expect(pairs[0].querySelector('.aoo-value').textContent).toBe('M');
    expect(badge.querySelector('.aoo-source')).toBeNull();
  });

  it('supports the plain style and marks title guesses', () => {
    const badge = createBadge(document, options, { source: 'title', style: 'plain', showSource: true });
    expect(badge.getAttribute('data-aoo-style')).toBe('plain');
    expect(badge.querySelector('.aoo-source').textContent).toBe('(from title)');
  });

  it('does not mark non-title sources even when asked to show the source', () => {
    const badge = createBadge(document, options, { source: 'page', showSource: true });
    expect(badge.querySelector('.aoo-source')).toBeNull();
    expect(createBadge(document, options).getAttribute('data-aoo-source')).toBe('page');
  });

  it('escapes values by using text nodes', () => {
    const badge = createBadge(document, [{ label: '<b>', value: '<img src=x onerror=alert(1)>' }]);
    expect(badge.querySelector('img')).toBeNull();
    expect(badge.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('placeBadge', () => {
  it('inserts after the anchor and replaces an existing badge', () => {
    document.body.innerHTML = '<div id="card"><div id="title">Title</div><div id="price">$1</div></div>';
    const anchor = document.getElementById('title');
    placeBadge(anchor, createBadge(document, options));
    placeBadge(anchor, createBadge(document, [{ label: 'Size', value: 'L' }]));
    const badges = document.querySelectorAll(`.${BADGE_CLASS}`);
    expect(badges).toHaveLength(1);
    expect(badges[0].previousElementSibling.id).toBe('title');
    expect(badges[0].nextElementSibling.id).toBe('price');
    expect(badges[0].textContent).toBe('SizeL');
  });

  it('works when the anchor has no parent element', () => {
    const orphan = document.createElement('div');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(orphan);
    placeBadge(orphan, createBadge(document, options));
    expect(fragment.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(1);
  });
});
