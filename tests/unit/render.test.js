import { describe, it, expect } from 'vitest';
import {
  applyTheme,
  createBadge,
  ensureStyles,
  formatOptions,
  isDarkBackground,
  parseColor,
  placeBadge,
  BADGE_CLASS,
  STYLE_ID,
  THEME_ATTR,
} from '../../src/core/render.js';

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
  it('injects the stylesheet once and keys dark colours on the page, not the OS', () => {
    document.head.innerHTML = '';
    ensureStyles(document);
    ensureStyles(document);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    const css = document.getElementById(STYLE_ID).textContent;
    expect(css).toContain(`.${BADGE_CLASS}`);
    expect(css).toContain(`html[${THEME_ATTR}="dark"]`);
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('falls back to the document element without a head', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.head.remove();
    ensureStyles(doc);
    expect(doc.getElementById(STYLE_ID)).not.toBeNull();
  });
});

describe('theme detection', () => {
  it('parses colours', () => {
    expect(parseColor('rgb(255, 255, 255)')).toEqual({ r: 255, g: 255, b: 255, alpha: 1 });
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor(null)).toBeNull();
  });

  it('marks dark pages dark and light pages light', () => {
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(applyTheme(document, window)).toBe('light');
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe('light');
    document.body.style.backgroundColor = 'rgb(20, 20, 20)';
    expect(applyTheme(document, window)).toBe('dark');
    document.body.style.backgroundColor = '';
    document.documentElement.style.backgroundColor = 'rgb(10, 10, 10)';
    expect(isDarkBackground(document, window)).toBe(true);
    document.documentElement.style.backgroundColor = '';
    expect(isDarkBackground(document, window)).toBe(false);
    expect(isDarkBackground(document, {})).toBe(false);
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

  it('appends inside a table cell instead of creating a new column', () => {
    document.body.innerHTML = '<table><tr><td id="cell"><a>Title</a></td><td>$1</td></tr></table>';
    const cell = document.getElementById('cell');
    placeBadge(cell, createBadge(document, options));
    placeBadge(cell, createBadge(document, [{ label: 'Size', value: 'L' }]));
    expect(cell.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(1);
    expect(document.querySelector('tr').children).toHaveLength(2);
  });

  it('works when the anchor has no parent element', () => {
    const orphan = document.createElement('div');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(orphan);
    placeBadge(orphan, createBadge(document, options));
    expect(fragment.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(1);
  });
});
