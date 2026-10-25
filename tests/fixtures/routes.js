/**
 * Maps an Amazon path to the fixture page that stands in for it. Shared by
 * the unit-test fetch stub and the Playwright route handler so both suites
 * answer the same URL with the same page.
 *
 * @param {string} pathname
 * @returns {string|null} fixture name without extension
 */
export function fixtureNameForPath(pathname) {
  const path = String(pathname || '').replace(/^\/-\/[a-z]{2}(?:[-_][A-Za-z]{2})?(?=\/)/, '');
  if (path === '/spr/returns/cart') return 'returns-cart';
  if (path.startsWith('/spr/returns/prep')) return 'returns-prep';
  if (path.endsWith('/order-details')) return 'order-details';
  if (path.endsWith('/order-history') || path === '/your-orders/orders') return 'orders-list';
  if (path === '/your-returns') return 'your-returns';
  const product = /^\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/.exec(path);
  if (product) return `product-${product[1]}`;
  return null;
}
