/**
 * Amazon product images share a stable id across sizes:
 * https://m.media-amazon.com/images/I/61i1wmPde8L._SS284_.jpg
 *                                     ^^^^^^^^^^^ image id
 * The id is the same on order pages, return pages and product pages, which
 * makes it a reliable key for matching an item between pages that do not
 * expose the ASIN.
 */

const IMAGE_ID = /\/images\/I\/([A-Za-z0-9%+_-]+?)(?:\.[^/]*)?$/;

/**
 * @param {string|null|undefined} src
 * @returns {string|null}
 */
export function extractImageId(src) {
  if (!src) return null;
  let path = String(src);
  try {
    path = new URL(path, 'https://www.amazon.com').pathname;
  } catch {
    // keep the raw string
  }
  const match = IMAGE_ID.exec(path);
  if (!match) return null;
  // Strip Amazon size modifiers such as "._AC_SS160_" that sit after the id.
  const id = match[1].split('._')[0];
  return id.length >= 6 ? id : null;
}

/**
 * Finds the image id of the first product image inside an element.
 *
 * @param {Element|null} root
 * @returns {string|null}
 */
export function imageIdFromElement(root) {
  if (!root) return null;
  const images = root.querySelectorAll('img');
  for (const img of images) {
    const id = extractImageId(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-a-hires'));
    if (id) return id;
  }
  return null;
}
