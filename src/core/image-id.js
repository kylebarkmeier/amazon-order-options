/**
 * Amazon product images share a stable id across sizes:
 * https://m.media-amazon.com/images/I/61i1wmPde8L._SS284_.jpg
 *                                     ^^^^^^^^^^^ image id
 * The id is the same on order pages, return pages and product pages. It is
 * per colour, not per size, so it identifies the product family and colour
 * but cannot tell two sizes apart.
 */

const IMAGE_ID = /\/images\/I\/([A-Za-z0-9%+_-]+?)(?:\.[^/]*)?$/;

/** Attributes that may carry the real image URL, in order of preference. */
const SOURCE_ATTRIBUTES = ['src', 'data-src', 'data-a-hires', 'data-old-hires', 'data-lazy-src'];

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
 * Reads the image id of one `<img>`, trying every attribute that may hold the
 * real URL so a lazy-loaded placeholder `src` does not hide it.
 *
 * @param {Element|null} img
 * @returns {string|null}
 */
export function imageIdFromImg(img) {
  if (!img || !img.getAttribute) return null;
  for (const attribute of SOURCE_ATTRIBUTES) {
    const id = extractImageId(img.getAttribute(attribute));
    if (id) return id;
  }
  const srcset = img.getAttribute('srcset');
  if (srcset) {
    for (const candidate of srcset.split(',')) {
      const id = extractImageId(candidate.trim().split(/\s+/)[0]);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Finds the image id of the first product image inside an element.
 *
 * @param {Element|null} root
 * @returns {string|null}
 */
export function imageIdFromElement(root) {
  if (!root || !root.querySelectorAll) return null;
  for (const img of root.querySelectorAll('img')) {
    const id = imageIdFromImg(img);
    if (id) return id;
  }
  return null;
}
