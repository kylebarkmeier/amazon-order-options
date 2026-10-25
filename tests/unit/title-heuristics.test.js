import { describe, it, expect } from 'vitest';
import { extractOptionsFromTitle, classifySegment } from '../../src/core/title-heuristics.js';

describe('classifySegment', () => {
  it.each([
    ['M', 'Size'],
    ['XX-Large', 'Size'],
    ['Small/Medium', 'Size'],
    ['3XL', 'Size'],
    ['One Size', 'Size'],
    ['9 Women/8.5 Men', 'Size'],
    ['10.5', 'Size'],
    ['9.30 fl oz', 'Size'],
    ['16 oz (Pack of 2)', 'Size'],
    ['Pack of 2', 'Pack'],
    ['2-Pack', 'Pack'],
    ['12 Count', 'Pack'],
    ['Green', null],
    ['Women', null],
    ['', null],
    [null, null],
  ])('%s -> %s', (segment, expected) => {
    expect(classifySegment(segment)).toBe(expected);
  });
});

describe('extractOptionsFromTitle', () => {
  it('reads a trailing size', () => {
    expect(extractOptionsFromTitle("Care Bears Cheer Bear Romper Women's Costume - M")).toEqual([{ label: 'Size', value: 'M' }]);
  });

  it('reads size from multiple trailing segments and ignores colors', () => {
    expect(extractOptionsFromTitle('Fun Costumes Hooded Sherpa Fleece Romper - Medium - Green')).toEqual([
      { label: 'Size', value: 'Medium' },
    ]);
  });

  it('reads parenthesised sizes and pack counts', () => {
    expect(extractOptionsFromTitle('Kigurumi Union Suit Pajama Outfit (Small/Medium)')).toEqual([
      { label: 'Size', value: 'Small/Medium' },
    ]);
    expect(extractOptionsFromTitle('Body Wash, 9.30 Fl Oz (Pack of 1)')).toEqual([
      { label: 'Size', value: '9.30 Fl Oz' },
      { label: 'Pack', value: 'Pack of 1' },
    ]);
  });

  it('reads explicit "Size X" phrases', () => {
    expect(extractOptionsFromTitle('Running Shoes for Men Size 10.5 Black')).toEqual([{ label: 'Size', value: '10.5' }]);
    expect(extractOptionsFromTitle('Hoodie Size: XL')).toEqual([{ label: 'Size', value: 'XL' }]);
  });

  it('returns nothing for titles without sizes or empty input', () => {
    expect(extractOptionsFromTitle('Lennox Healthy Climate #35 Water Panel Evaporator')).toEqual([]);
    expect(extractOptionsFromTitle('Hair Tinsel Clip in 18Pcs Silver Hair Tinsel - Sparkly')).toEqual([]);
    expect(extractOptionsFromTitle('')).toEqual([]);
    expect(extractOptionsFromTitle(null)).toEqual([]);
  });
});
