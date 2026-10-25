import { describe, it, expect } from 'vitest';
import {
  extractJsonValue,
  parseTwisterData,
  variationForAsin,
  parseVariationFromDom,
  humanizeDimension,
  cleanLabel,
} from '../../src/core/variation-parser.js';
import { fixtureHtml, fixtureDom } from './helpers.js';

describe('extractJsonValue', () => {
  it('reads objects, arrays, strings, numbers and booleans', () => {
    const text = '{ "obj" : {"a":{"b":[1,2]}}, "arr": ["x","y"], "str" : "he said \\"hi\\" {x}", "num": 42, "flag": true, "nil": null }';
    expect(extractJsonValue(text, 'obj')).toEqual({ a: { b: [1, 2] } });
    expect(extractJsonValue(text, 'arr')).toEqual(['x', 'y']);
    expect(extractJsonValue(text, 'str')).toBe('he said "hi" {x}');
    expect(extractJsonValue(text, 'num')).toBe(42);
    expect(extractJsonValue(text, 'flag')).toBe(true);
    expect(extractJsonValue(text, 'nil')).toBe(null);
  });

  it('ignores braces inside strings when balancing', () => {
    const text = '"data": {"k":"}{", "n":{"deep":"]"}}, "after": 1';
    expect(extractJsonValue(text, 'data')).toEqual({ k: '}{', n: { deep: ']' } });
  });

  it('returns null for missing keys, unterminated values and empty input', () => {
    expect(extractJsonValue('{"a":1}', 'b')).toBeNull();
    expect(extractJsonValue('"a": {"unterminated": 1', 'a')).toBeNull();
    expect(extractJsonValue('"a": "unterminated', 'a')).toBeNull();
    expect(extractJsonValue('"a": undefined', 'a')).toBeNull();
    expect(extractJsonValue('', 'a')).toBeNull();
    expect(extractJsonValue(null, 'a')).toBeNull();
  });

  it('skips an unparsable first occurrence and uses the next one', () => {
    const text = '"k": {bad json}, "k": {"ok": true}';
    expect(extractJsonValue(text, 'k')).toEqual({ ok: true });
  });
});

describe('parseTwisterData', () => {
  it('parses the product page fixture', () => {
    const twister = parseTwisterData(fixtureHtml('product-B0ROMPRMED'));
    expect(twister).not.toBeNull();
    expect(twister.currentAsin).toBe('B0ROMPRMED');
    expect(twister.parentAsin).toBe('B0ROMPRPAR');
    expect(twister.dimensions).toEqual(['size_name', 'color_name']);
    expect(twister.labels).toEqual({ size_name: 'Size', color_name: 'Color' });
    expect(twister.valuesByAsin.B0ROMPRLRG).toEqual(['L', 'Pink']);
    expect(Object.keys(twister.valuesByAsin)).toHaveLength(5);
  });

  it('derives dimensions from labels when the dimensions array is missing', () => {
    const html = `"dimensionValuesDisplayData" : {"b0abcdefgh":[" 9 oz "]}, "variationDisplayLabels" : {"size_name":"Size"}`;
    const twister = parseTwisterData(html);
    expect(twister.dimensions).toEqual(['size_name']);
    expect(twister.valuesByAsin.B0ABCDEFGH).toEqual(['9 oz']);
    expect(twister.currentAsin).toBeNull();
  });

  it('drops non-array entries and tolerates missing labels', () => {
    const html = `"dimensionValuesDisplayData" : {"B0ABCDEFGH":["M"],"B0BROKEN00":"M"}`;
    const twister = parseTwisterData(html);
    expect(twister.valuesByAsin).toEqual({ B0ABCDEFGH: ['M'] });
    expect(twister.labels).toEqual({});
    expect(twister.dimensions).toEqual([]);
  });

  it('returns null when there is no twister data or the value is malformed', () => {
    expect(parseTwisterData(fixtureHtml('product-B0NOTWISTR'))).toBeNull();
    expect(parseTwisterData('"dimensionValuesDisplayData" : ["not","an","object"]')).toBeNull();
    expect(parseTwisterData('"dimensionValuesDisplayData" : {oops')).toBeNull();
    expect(parseTwisterData('')).toBeNull();
    expect(parseTwisterData(undefined)).toBeNull();
    expect(parseTwisterData(123)).toBeNull();
  });
});

describe('variationForAsin', () => {
  const twister = parseTwisterData(fixtureHtml('product-B0ROMPRMED'));

  it('returns labelled pairs for a known asin', () => {
    expect(variationForAsin(twister, 'B0ROMPRMED')).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Pink' },
    ]);
    expect(variationForAsin(twister, 'b0romprmbl')).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Blue' },
    ]);
  });

  it('returns null for unknown asins or missing data', () => {
    expect(variationForAsin(twister, 'B0UNKNOWN0')).toBeNull();
    expect(variationForAsin(null, 'B0ROMPRMED')).toBeNull();
    expect(variationForAsin(twister, '')).toBeNull();
  });

  it('falls back to humanized dimension names and positional labels', () => {
    const custom = {
      dimensions: ['flavor_name'],
      labels: {},
      valuesByAsin: { B0ABCDEFGH: ['Vanilla', 'Extra', ''] },
    };
    expect(variationForAsin(custom, 'B0ABCDEFGH')).toEqual([
      { label: 'Flavor', value: 'Vanilla' },
      { label: 'Option 2', value: 'Extra' },
    ]);
  });
});

describe('parseVariationFromDom', () => {
  it('reads classic twister widgets', () => {
    const doc = fixtureDom('product-B0ROMPRMED').window.document;
    expect(parseVariationFromDom(doc)).toEqual([
      { label: 'Size', value: 'M' },
      { label: 'Color', value: 'Pink' },
    ]);
  });

  it('reads inline twister text when classic widgets are absent', () => {
    const doc = fixtureDom('product-B0SHOESGR9').window.document;
    expect(parseVariationFromDom(doc)).toEqual([
      { label: 'Size', value: '9 Women/8.5 Men' },
      { label: 'Color', value: 'Green' },
    ]);
  });

  it('skips widgets without a selection and handles bad input', () => {
    document.body.innerHTML = `
      <div id="variation_size_name"><label class="a-form-label">Size:</label></div>
      <div id="variation_style_name"><span class="selection">  </span></div>
      <div id="variation_pattern_name"><span class="selection">Striped</span></div>
      <span id="inline-twister-expanded-dimension-text-size_name">ignored because classic widgets matched</span>`;
    expect(parseVariationFromDom(document)).toEqual([{ label: 'Pattern', value: 'Striped' }]);
    expect(parseVariationFromDom(null)).toEqual([]);
    expect(parseVariationFromDom({})).toEqual([]);
  });

  it('ignores empty inline twister values', () => {
    document.body.innerHTML = '<span id="inline-twister-expanded-dimension-text-size_name">   </span>';
    expect(parseVariationFromDom(document)).toEqual([]);
  });
});

describe('labels', () => {
  it('humanizes dimension keys', () => {
    expect(humanizeDimension('size_name')).toBe('Size');
    expect(humanizeDimension('item_package_quantity')).toBe('Package Quantity');
    expect(humanizeDimension('custom_thing_name')).toBe('Custom Thing');
    expect(humanizeDimension('')).toBe('');
    expect(humanizeDimension(undefined)).toBe('');
  });

  it('cleans labels', () => {
    expect(cleanLabel(' Size : ')).toBe('Size');
    expect(cleanLabel('Color\n  Name:')).toBe('Color Name');
    expect(cleanLabel(null)).toBe('');
  });
});
