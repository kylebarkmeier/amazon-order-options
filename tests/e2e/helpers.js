import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureNameForPath } from '../fixtures/routes.js';

export const AMAZON = 'https://www.amazon.com';
export const FIXTURES = path.resolve('tests/fixtures/pages');
export const USERSCRIPT_PATH = path.resolve('dist/userscript/amazon-order-options.user.js');
export const CHROME_EXTENSION_PATH = path.resolve('dist/chrome');

/** A 1x1 transparent PNG served for every product image. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * @param {string} pathname
 * @returns {string|null} fixture file path
 */
export function fixtureForPath(pathname) {
  const name = fixtureNameForPath(pathname);
  if (!name) return null;
  const file = path.join(FIXTURES, `${name}.html`);
  return existsSync(file) ? file : null;
}

/**
 * Answers every Amazon request from the fixtures so no test touches the real site.
 *
 * @param {import('@playwright/test').BrowserContext|import('@playwright/test').Page} target
 * @returns {Promise<string[]>} log of requested Amazon paths, appended to as requests arrive
 */
export async function routeAmazon(target) {
  const log = [];
  await target.route(/^https:\/\/([a-z0-9-]+\.)*amazon\.com\//, async (route) => {
    const url = new URL(route.request().url());
    log.push(url.pathname);
    const file = fixtureForPath(url.pathname);
    if (!file) {
      await route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title><h1>Not found</h1>' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(file, 'utf8') });
  });
  await target.route(/^https:\/\/([a-z0-9-]+\.)*(media-amazon|ssl-images-amazon)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }),
  );
  await target.route(/^https:\/\/example\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: readFileSync(path.join(FIXTURES, 'not-amazon.html'), 'utf8') }),
  );
  return log;
}

/**
 * Loads the built userscript into the page, the way Tampermonkey would after load.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function injectUserscript(page) {
  await page.addScriptTag({ path: USERSCRIPT_PATH });
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} badge texts in document order
 */
export async function badgeTitles(page) {
  return page.locator('.aoo-badge').evaluateAll((els) => els.map((el) => el.getAttribute('title')));
}
