import { describe, it, expect } from 'vitest';
import {
  extractLabelValuePairs,
  findHiddenDetailBlocks,
  collectHints,
  agreedPairs,
  isOptionLabel,
  isOptionValue,
  isMetadataLabel,
} from '../../src/core/dom-hints.js';
import { fixtureDom } from './helpers.js';

describe('labels and values', () => {
  it('accepts variation labels in several languages and rejects everything else', () => {
    for (const label of ['Size', 'Colour:', 'Band Size', 'Größe', 'Taille', 'Talla', 'Taglia', 'Maat', 'Storlek', 'Rozmiar', 'Tamanho', 'Beden', 'サイズ', 'المقاس']) {
      expect(isOptionLabel(label)).toBe(true);
    }
    for (const label of ['Order #', 'Sold by', 'Quantity', 'Return or replace items', 'Delivered', 'Something Unusual', 'Bestellnummer', 'Verkauft von', 'Menge', 'Artikelpreis', '', 'x'.repeat(41)]) {
      expect(isOptionLabel(label)).toBe(false);
    }
  });

  it('recognises order metadata labels across languages', () => {
    for (const label of ['Order #', 'Sold by', 'Quantity', 'Bestellnummer', 'Verkauft von', 'Menge', 'Artikelpreis', 'Numéro de commande', 'Vendu par', 'Quantité', 'Return or replace items']) {
      expect(isMetadataLabel(label)).toBe(true);
    }
    expect(isMetadataLabel('Spider-Man')).toBe(false);
    expect(isMetadataLabel('')).toBe(false);
  });

  it('rejects values that cannot be a variation', () => {
    expect(isOptionValue('M')).toBe(true);
    expect(isOptionValue('9.30 Fl Oz (Pack of 1)')).toBe(true);
    expect(isOptionValue('111-2222222-3333333')).toBe(false);
    expect(isOptionValue('$21.99')).toBe(false);
    expect(isOptionValue('21,99 €')).toBe(false);
    expect(isOptionValue('https://example.com')).toBe(false);
    expect(isOptionValue('November 24, 2026')).toBe(false);
    expect(isOptionValue('42')).toBe(true);
    expect(isOptionValue('Color:')).toBe(false);
    expect(isOptionValue('Shape: Round')).toBe(false);
    expect(isOptionValue('')).toBe(false);
    expect(isOptionValue('x'.repeat(81))).toBe(false);
  });
});

describe('extractLabelValuePairs', () => {
  it('reads split spans and single text nodes, keeping only option labels', () => {
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
        <span>Quantity: 2</span>
      </div>`;
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Size', value: '9.30 Fl Oz (Pack of 1)' },
      { label: 'Color', value: 'Green' },
      { label: 'Style', value: 'Classic' },
    ]);
  });

  it('keeps German option rows and drops German order metadata', () => {
    document.body.innerHTML = `
      <div>
        <span>Bestellnummer: </span><span>111-2222222-3333333</span><br>
        <span>Verkauft von: </span><span>Händler GmbH</span><br>
        <span>Größe: </span><span>42</span><br>
        <span>Farbe: </span><span>Rosa</span><br>
        <span>Menge: </span><span>1</span><br>
        <span>Artikelpreis: </span><span>21,99 €</span>
      </div>`;
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Größe', value: '42' },
      { label: 'Farbe', value: 'Rosa' },
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

  it('does not pair a label whose value is missing with the next label', () => {
    document.body.innerHTML = `
      <div>
        <span>Size: </span><span></span><br>
        <span>Color: </span><span>Red</span>
      </div>
      <div>
        <div><span>Material:</span></div>
        <div><span>Shape:</span><span>Round</span></div>
      </div>`;
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Color', value: 'Red' },
      { label: 'Shape', value: 'Round' },
    ]);
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
    document.body.innerHTML = '<div><b>Size:</b> <span>Large</span></div><div><b>Material:</b> <span><i>Cotton</i></span></div>';
    expect(extractLabelValuePairs(document.body)).toEqual([
      { label: 'Size', value: 'Large' },
      { label: 'Material', value: 'Cotton' },
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

  it('never attaches a block whose image id is known and different, even when the title matches', () => {
    document.body.innerHTML = `
      <div id="card"><img src="https://m.media-amazon.com/images/I/81shoesBlueL._SS100_.jpg"><span>PYYIQI Glitter Led Shoes Light Up</span></div>
      <div id="single-item-details-content-1" class="aok-hidden"><img src="https://m.media-amazon.com/images/I/81shoesGreenL._SS100_.jpg"><span>PYYIQI Glitter Led Shoes Light Up</span><span>Color: </span><span>Green</span></div>
      <div id="single-item-details-content-2" class="aok-hidden"><img src="https://m.media-amazon.com/images/I/81shoesBlueL._SS100_.jpg"><span>PYYIQI Glitter Led Shoes Light Up</span><span>Color: </span><span>Blue</span></div>`;
    const blocks = findHiddenDetailBlocks(document.getElementById('card'), { imageId: '81shoesBlueL', title: 'PYYIQI Glitter Led Shoes Light Up' });
    expect(blocks.map((b) => b.id)).toEqual(['single-item-details-content-2']);
  });

  it('matches imageless page-level blocks by title only when the match is unique', () => {
    document.body.innerHTML = `
      <div id="card"><span>Some Product Title Long Enough</span></div>
      <div id="single-item-details-content-1" class="aok-hidden"><span>Some Product Title Long Enough</span><span>Size: </span><span>M</span></div>
      <div id="single-item-details-content-2" class="aok-hidden"><span>Another Product</span></div>`;
    expect(findHiddenDetailBlocks(document.getElementById('card'), { title: 'Some Product Title Long Enough' }).map((b) => b.id)).toEqual([
      'single-item-details-content-1',
    ]);
    document.body.insertAdjacentHTML('beforeend', '<div id="single-item-details-content-3" class="aok-hidden"><span>Some Product Title Long Enough - L</span></div>');
    expect(findHiddenDetailBlocks(document.getElementById('card'), { title: 'Some Product Title Long Enough' })).toEqual([]);
  });

  it('returns nothing for a missing card', () => {
    expect(findHiddenDetailBlocks(null, {})).toEqual([]);
  });
});

describe('collectHints', () => {
  it('merges card and hidden hints and ranks size first', () => {
    const doc = fixtureDom('returns-prep').window.document;
    const card = doc.querySelector('.a-box-inner .a-row.a-grid-vertical-align');
    expect(collectHints(card, { imageId: '81shoesGreenL', title: 'PYYIQI Glitter Led Shoes' })).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
  });

  it('keeps only the labels that all matching blocks agree on', () => {
    document.body.innerHTML = `
      <div id="card"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS100_.jpg"><span>Care Bears Cheer Bear Romper Women's...</span></div>
      <div id="single-item-details-content-1" class="aok-hidden"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS100_.jpg"><span>Size: </span><span>M</span><span>Color: </span><span>Pink</span></div>
      <div id="single-item-details-content-2" class="aok-hidden"><img src="https://m.media-amazon.com/images/I/71romperPnkL._SS100_.jpg"><span>Size: </span><span>L</span><span>Color: </span><span>Pink</span></div>`;
    expect(collectHints(document.getElementById('card'), { imageId: '71romperPnkL', title: "Care Bears Cheer Bear Romper Women's..." })).toEqual([
      { label: 'Color', value: 'Pink' },
    ]);
  });

  it('orders size, then colour, then the rest', () => {
    document.body.innerHTML = `
      <div id="card">
        <span>Style: Modern</span>
        <span>Color: Red</span>
        <span>Size: S</span>
      </div>`;
    expect(collectHints(document.getElementById('card'), {}).map((p) => p.label)).toEqual(['Size', 'Color', 'Style']);
  });

  it('reads the return cart popover', () => {
    const doc = fixtureDom('returns-cart').window.document;
    const card = doc.querySelector('#items-expanded-section .a-row.a-grid-vertical-align');
    expect(collectHints(card, { imageId: '61bodyWashXL' })).toEqual([{ label: 'Size', value: '9.30 Fl Oz (Pack of 1)' }]);
  });
});

describe('agreedPairs', () => {
  it('keeps unanimous labels and drops disputed ones', () => {
    expect(
      agreedPairs([
        [{ label: 'Size', value: 'M' }, { label: 'Color', value: 'Pink' }],
        [{ label: 'Size', value: 'L' }, { label: 'Colour', value: 'pink' }],
        [{ label: 'Material', value: 'Cotton' }],
      ]),
    ).toEqual([
      { label: 'Color', value: 'Pink' },
      { label: 'Material', value: 'Cotton' },
    ]);
    expect(agreedPairs([])).toEqual([]);
  });
});
