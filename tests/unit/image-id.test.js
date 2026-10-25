import { describe, it, expect } from 'vitest';
import { extractImageId, imageIdFromElement } from '../../src/core/image-id.js';

describe('extractImageId', () => {
  it.each([
    ['https://m.media-amazon.com/images/I/61i1wmPde8L._SS284_.jpg', '61i1wmPde8L'],
    ['https://m.media-amazon.com/images/I/61i1wmPde8L._AC_._SS160_.jpg', '61i1wmPde8L'],
    ['https://images-na.ssl-images-amazon.com/images/I/81a8dvWZaeL.jpg', '81a8dvWZaeL'],
    ['/images/I/71fCejJsIzL._AC_UL320_.jpg', '71fCejJsIzL'],
    ['https://m.media-amazon.com/images/I/41abc+DEF9L._SY300_.png', '41abc+DEF9L'],
  ])('%s -> %s', (src, expected) => {
    expect(extractImageId(src)).toBe(expected);
  });

  it('returns null for non-product images', () => {
    expect(extractImageId('https://m.media-amazon.com/images/G/01/nav/sprite.png')).toBeNull();
    expect(extractImageId('data:image/png;base64,AAAA')).toBeNull();
    expect(extractImageId('')).toBeNull();
    expect(extractImageId(null)).toBeNull();
    expect(extractImageId('https://m.media-amazon.com/images/I/ab.jpg')).toBeNull();
  });
});

describe('imageIdFromElement', () => {
  it('finds the first product image in a subtree', () => {
    document.body.innerHTML = `
      <div id="root">
        <img src="https://m.media-amazon.com/images/G/01/x.png">
        <img data-src="https://m.media-amazon.com/images/I/61i1wmPde8L._SS284_.jpg">
      </div>`;
    expect(imageIdFromElement(document.getElementById('root'))).toBe('61i1wmPde8L');
  });

  it('returns null without images', () => {
    document.body.innerHTML = '<div id="root"></div>';
    expect(imageIdFromElement(document.getElementById('root'))).toBeNull();
    expect(imageIdFromElement(null)).toBeNull();
  });
});
