import { describe, it, expect } from 'vitest';
import { collapseWhitespace, dedupeByLabel, fullText, labelKey, normalizeTitle, TRUNCATED_TITLE } from '../../src/core/text.js';
import { AMAZON_MATCH_PATTERNS, AMAZON_TLDS } from '../../src/core/hosts.js';

describe('text helpers', () => {
  it('collapses whitespace', () => {
    expect(collapseWhitespace('  a \n b  ')).toBe('a b');
    expect(collapseWhitespace(null)).toBe('');
  });

  it('prefers the full copy of a truncated title', () => {
    document.body.innerHTML = `
      <span id="t"><span class="a-truncate-full a-offscreen">Full title here</span><span class="a-truncate-cut">Full ti...</span></span>
      <span id="u">  Plain   text </span>
      <a id="v"><span class="a-truncate"><span class="a-truncate-full"></span><span class="a-truncate-cut">Only the cut</span></span></a>`;
    expect(fullText(document.getElementById('t'))).toBe('Full title here');
    expect(fullText(document.getElementById('u'))).toBe('Plain text');
    expect(fullText(document.getElementById('v'))).toBe('Only the cut');
  });

  it('normalizes titles', () => {
    expect(normalizeTitle('  Foo   Bar... ')).toBe('foo bar');
    expect(normalizeTitle('Foo…')).toBe('foo');
    expect(normalizeTitle(null)).toBe('');
  });

  it('detects truncated titles', () => {
    expect(TRUNCATED_TITLE.test('Cut...')).toBe(true);
    expect(TRUNCATED_TITLE.test('Cut…')).toBe(true);
    expect(TRUNCATED_TITLE.test('Complete')).toBe(false);
  });

  it('dedupes by label and treats colour as color', () => {
    expect(
      dedupeByLabel([
        { label: 'Colour', value: 'Rose' },
        { label: 'Size', value: 'M' },
        { label: 'Color', value: 'Pink' },
        { label: 'size:', value: 'L' },
        { label: '', value: 'x' },
      ]),
    ).toEqual([
      { label: 'Colour', value: 'Rose' },
      { label: 'Size', value: 'M' },
    ]);
    expect(dedupeByLabel(null)).toEqual([]);
    expect(labelKey(' Colour : ')).toBe('color');
  });
});

describe('hosts', () => {
  it('lists every marketplace once and builds match patterns from it', () => {
    expect(new Set(AMAZON_TLDS).size).toBe(AMAZON_TLDS.length);
    expect(AMAZON_MATCH_PATTERNS).toHaveLength(AMAZON_TLDS.length);
    expect(AMAZON_MATCH_PATTERNS[0]).toBe('https://*.amazon.com/*');
    expect(AMAZON_MATCH_PATTERNS).toContain('https://*.amazon.co.jp/*');
  });
});
