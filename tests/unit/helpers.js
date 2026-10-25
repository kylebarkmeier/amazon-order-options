import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { fixtureNameForPath } from '../fixtures/routes.js';

const fixturesDir = path.resolve('tests/fixtures/pages');

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
  const name = fixtureNameForPath(new URL(url).pathname);
  if (!name) return null;
  try {
    return fixtureHtml(name);
  } catch {
    return null;
  }
}

/**
 * fetchText implementation backed by the fixtures, recording every URL and
 * credential mode. Missing pages reject like a 404 would.
 *
 * @returns {{fetchText: (url: string, init?: object) => Promise<{text: string, url: string}>, calls: string[], modes: string[]}}
 */
export function fixtureFetch() {
  const calls = [];
  const modes = [];
  return {
    calls,
    modes,
    async fetchText(url, init = {}) {
      calls.push(url);
      modes.push(init.credentials || 'include');
      const html = fixtureForUrl(url);
      if (html === null) throw new Error(`404 ${url}`);
      return { text: html, url };
    },
  };
}
