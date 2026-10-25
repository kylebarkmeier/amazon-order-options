import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pages');

/**
 * @param {string} name fixture file name without extension
 * @returns {string}
 */
export function fixtureHtml(name) {
  return readFileSync(path.join(fixturesDir, `${name}.html`), 'utf8');
}

/**
 * @param {string} name
 * @param {string} [url]
 * @returns {JSDOM}
 */
export function fixtureDom(name, url = 'https://www.amazon.com/') {
  return new JSDOM(fixtureHtml(name), { url });
}

/**
 * Maps request URLs to fixture HTML the way the e2e route handler does.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function fixtureForUrl(url) {
  const { pathname } = new URL(url);
  if (pathname === '/spr/returns/cart') return fixtureHtml('returns-cart');
  if (pathname.startsWith('/spr/returns/prep')) return fixtureHtml('returns-prep');
  if (pathname.endsWith('/order-details')) return fixtureHtml('order-details');
  if (pathname.endsWith('/order-history') || pathname === '/your-orders/orders') return fixtureHtml('orders-list');
  if (pathname === '/your-returns') return fixtureHtml('your-returns');
  const product = /^\/dp\/([A-Z0-9]{10})/.exec(pathname);
  if (product) {
    try {
      return fixtureHtml(`product-${product[1]}`);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * fetchText implementation backed by the fixtures, recording every URL.
 *
 * @returns {{fetchText: (url: string) => Promise<string>, calls: string[]}}
 */
export function fixtureFetch() {
  const calls = [];
  return {
    calls,
    async fetchText(url) {
      calls.push(url);
      const html = fixtureForUrl(url);
      if (html === null) throw new Error(`404 ${url}`);
      return html;
    },
  };
}
