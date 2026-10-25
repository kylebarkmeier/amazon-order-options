import { parseTwisterData, variationForAsin, parseVariationFromDom } from './variation-parser.js';
import { parseOrderItems, matchOrderItem } from './order-page-parser.js';
import { extractOptionsFromTitle } from './title-heuristics.js';
import { orderDetailsUrl, productUrl } from './page-detector.js';
import { DAY_MS } from './cache.js';

/**
 * Decides where an item's selected options come from and fetches whatever is
 * missing, in this order:
 *
 *  1. hints already on the page (visible or hidden "Size: M" rows)
 *  2. the product page for the item's child ASIN (twister data)
 *  3. the order details page, to find the ASIN via the image id, then (2)
 *  4. the product title
 *
 * All network access goes through the injected `fetchText`, and all results
 * are cached, so a page with many items only fetches each page once.
 */

export const SOURCES = Object.freeze({
  PAGE: 'page',
  PRODUCT: 'product',
  TITLE: 'title',
});

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 * @typedef {{ options: OptionPair[], source: string, asin?: string|null, title?: string|null }} Resolution
 */

/**
 * @param {Object} deps
 * @param {(url: string) => Promise<string>} deps.fetchText
 * @param {{get: (k: string) => Promise<any>, set: (k: string, v: any, ttl: number) => Promise<void>}} deps.cache
 * @param {(html: string) => Document|null} [deps.parseHtml]
 * @param {{fetchProductPages?: boolean, fetchOrderPages?: boolean, useTitleHeuristics?: boolean}} [deps.settings]
 * @param {number} [deps.maxFetchesPerPage]
 */
export function createResolver({ fetchText, cache, parseHtml = defaultParseHtml, settings = {}, maxFetchesPerPage = 40 }) {
  const inflight = new Map();
  let fetchCount = 0;

  const config = {
    fetchProductPages: settings.fetchProductPages !== false,
    fetchOrderPages: settings.fetchOrderPages !== false,
    useTitleHeuristics: settings.useTitleHeuristics !== false,
  };

  /**
   * Deduplicates concurrent requests for the same URL and enforces a per-page cap.
   * @param {string} url
   * @returns {Promise<string|null>}
   */
  function fetchOnce(url) {
    if (inflight.has(url)) return inflight.get(url);
    if (fetchCount >= maxFetchesPerPage) return Promise.resolve(null);
    fetchCount += 1;
    const promise = fetchText(url)
      .catch(() => null)
      .finally(() => inflight.delete(url));
    inflight.set(url, promise);
    return promise;
  }

  /**
   * @param {string} origin
   * @param {string} asin
   * @returns {Promise<OptionPair[]|null>}
   */
  async function resolveByAsin(origin, asin) {
    if (!asin) return null;
    const key = `asin:${asin}`;
    const cached = await cache.get(key);
    if (cached !== null && cached !== undefined) return cached.length ? cached : null;
    if (!config.fetchProductPages) return null;

    const html = await fetchOnce(productUrl(origin, asin));
    if (!html) return null;

    let options = variationForAsin(parseTwisterData(html), asin);
    if (!options || options.length === 0) {
      const doc = parseHtml(html);
      options = doc ? parseVariationFromDom(doc) : [];
    }
    const result = options && options.length ? options : [];
    await cache.set(key, result, 7 * DAY_MS);
    return result.length ? result : null;
  }

  /**
   * @param {string} origin
   * @param {string} orderId
   * @returns {Promise<import('./order-page-parser.js').OrderItem[]>}
   */
  async function resolveOrderItems(origin, orderId) {
    if (!orderId) return [];
    const key = `order:${orderId}`;
    const cached = await cache.get(key);
    if (Array.isArray(cached) && cached.length) return cached;
    if (!config.fetchOrderPages) return [];

    const html = await fetchOnce(orderDetailsUrl(origin, orderId));
    if (!html) return [];
    const doc = parseHtml(html);
    const items = doc ? parseOrderItems(doc) : [];
    if (items.length) await cache.set(key, items, DAY_MS);
    return items;
  }

  /**
   * @param {Object} card
   * @param {string} card.origin
   * @param {string|null} [card.asin]
   * @param {string|null} [card.imageId]
   * @param {string|null} [card.title]
   * @param {string|null} [card.orderId]
   * @param {OptionPair[]} [card.hints]
   * @returns {Promise<Resolution|null>}
   */
  async function resolveCard(card) {
    const hints = Array.isArray(card.hints) ? card.hints : [];
    let asin = card.asin || null;
    let fullTitle = null;

    // The order page is only worth a request when the page itself says nothing.
    if (!asin && hints.length === 0 && card.orderId && (card.imageId || card.title)) {
      const items = await resolveOrderItems(card.origin, card.orderId);
      const match = matchOrderItem(items, { imageId: card.imageId, title: card.title });
      if (match) {
        asin = match.asin;
        fullTitle = match.title;
      }
    }

    const product = asin ? await resolveByAsin(card.origin, asin) : null;
    const merged = mergeOptions(hints, product);
    if (merged.length) {
      return { options: merged, source: product ? SOURCES.PRODUCT : SOURCES.PAGE, asin, title: fullTitle };
    }

    if (config.useTitleHeuristics) {
      const fromTitle = extractOptionsFromTitle(fullTitle || card.title);
      if (fromTitle.length) return { options: fromTitle, source: SOURCES.TITLE, asin, title: fullTitle };
    }

    return fullTitle ? { options: [], source: SOURCES.PAGE, asin, title: fullTitle } : null;
  }

  return { resolveCard, resolveByAsin, resolveOrderItems, get fetchCount() { return fetchCount; } };
}

/**
 * Product data is authoritative for labels it knows about; page hints fill
 * in anything else.
 *
 * @param {OptionPair[]} hints
 * @param {OptionPair[]|null} product
 * @returns {OptionPair[]}
 */
export function mergeOptions(hints, product) {
  const out = [];
  const seen = new Set();
  for (const pair of [...(product || []), ...hints]) {
    const key = pair.label.toLowerCase().replace(/colour/, 'color');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

/**
 * @param {string} html
 * @returns {Document|null}
 */
function defaultParseHtml(html) {
  if (typeof DOMParser === 'undefined') return null;
  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
}
