import { describe, it, expect } from 'vitest';
import { extractLabelValuePairs, findHiddenDetailBlocks, collectHints, isOptionLabel } from '../../src/core/dom-hints.js';
import { fixtureDom } from './helpers.js';

describe('isOptionLabel', () => {
  it('accepts variation labels and rejects order metadata', () => {
    expect(isOptionLabel('Size')).toBe(true);
    expect(isOptionLabel('Colour:')).toBe(true);
    expect(isOptionLabel('Something Unusual')).toBe(true);
    expect(isOptionLabel('Order #')).toBe(false);
    expect(isOptionLabel('Sold by')).toBe(false);
    expect(isOptionLabel('Quantity')).toBe(false);
    expect(isOptionLabel('Return or replace items')).toBe(false);
    expect(isOptionLabel('Delivered')).toBe(false);
    expect(isOptionLabel('Ships from')).toBe(false);
    expect(isOptionLabel('Shipping weight')).toBe(false);
    expect(isOptionLabel('Band Size')).toBe(true);
    expect(isOptionLabel('')).toBe(false);
    expect(isOptionLabel('x'.repeat(41))).toBe(false);
  });
});

describe('extractLabelValuePairs', () => {
  it('reads split spans and single text nodes', () => {
    document.body.innerHTML = `
      <div>
        <div class="a-row"><span> Size:  </span><span> 9.30 Fl Oz (Pack of 1) </span></div>
        <div class="a-row"><span>Order #:</span><span>111-2222222-3333333</span></div>
        <span>Color: Green</span>
        <span>Sold by: Someone</span>
        <span>Link: https://example.com/not-an-option</span>
        <span>Size:</span>
        <span></span>
        <span>Medium</span>
        <p>Style: Classic</p>
      </div>`;
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Size', value: '9.30 Fl Oz (Pack of 1)' },
      { label: 'Color', value: 'Green' },
      { label: 'Size', value: 'Medium' },
      { label: 'Style', value: 'Classic' },
    ]);
  });

  it('finds a value in the next row when the label row has no sibling', () => {
    document.body.innerHTML = `
      <div>
        <div><span>Pattern:</span></div>
        <div><span>Striped</span></div>
      </div>`;
    expect(extractLabelValuePairs(document.body)).toEqual([{ label: 'Pattern', value: 'Striped' }]);
  });

  it('ignores badges it inserted itself, long values and bad input', () => {
    document.body.innerHTML = `
      <div class="aoo-badge"><span>Size: M</span></div>
      <span>Size: ${'x'.repeat(90)}</span>
      <span>Size: </span>`;
    expect(extractLabelValuePairs(document.body)).toEqual([]);
    expect(extractLabelValuePairs(null)).toEqual([]);
    expect(extractLabelValuePairs({})).toEqual([]);
  });

  it('treats elements with only inline children as leaves', () => {
    document.body.innerHTML = '<div><b>Size:</b> <span>Large</span></div><div><b>Nested:</b> <span><i>deep</i></span></div>';
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Size', value: 'Large' },
      { label: 'Nested', value: 'deep' },
    ]);
  });
});

describe('findHiddenDetailBlocks', () => {
  it('finds popovers inside the card and page-level blocks by image id', () => {
    const doc = fixtureDom('returns-prep').window.document;
    const card = doc.querySelector('.a-box-inner .a-row.a-grid-vertical-align');
    const blocks = findHiddenDetailBlocks(card, { imageId: '81shoesGreenL', title: 'PYYIQI Glitter Led Shoes' });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toMatch(/^single-item-details-content/);
  });

  it('matches page-level blocks by title when there is no image', () => {
    document.body.innerHTML = `
      <div id="card"><span>Some Product Title Long Enough</span></div>
      <div id="single-item-details-content-1" class="aok-hidden"><span>Some Product Title Long Enough</span><span>Size: </span><span>M</span></div>
      <div id="single-item-details-content-2" class="aok-hidden"><span>Another Product</span></div>`;
    const blocks = findHiddenDetailBlocks(document.getElementById('card'), { title: 'Some Product Title Long Enough' });
    expect(blocks.map((b) => b.id)).toEqual(['single-item-details-content-1']);
  });

  it('returns nothing for a missing card', () => {
    expect(findHiddenDetailBlocks(null, {})).toEqual([]);
  });
});

describe('collectHints', () => {
  it('merges card and hidden hints, ranks size first and dedupes labels', () => {
    const doc = fixtureDom('returns-prep').window.document;
    const card = doc.querySelector('.a-box-inner .a-row.a-grid-vertical-align');
    expect(collectHints(card, { imageId: '81shoesGreenL', title: 'PYYIQI Glitter Led Shoes' })).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
  });

  it('orders known labels before unknown ones', () => {
    document.body.innerHTML = `
      <div id="card">
        <span>Weird: thing</span>
        <span>Style: Modern</span>
        <span>Color: Red</span>
        <span>Size: S</span>
      </div>`;
    expect(collectHints(document.getElementById('card'), {}).map((p) => p.label)).toEqual(['Size', 'Color', 'Style', 'Weird']);
  });

  it('reads the return cart popover', () => {
    const doc = fixtureDom('returns-cart').window.document;
    const card = doc.querySelector('#items-expanded-section .a-row.a-grid-vertical-align');
    expect(collectHints(card, { imageId: '61bodyWashXL' })).toEqual([{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }]);
  });
});
