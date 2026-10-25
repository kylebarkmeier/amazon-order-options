import {
  parseTwisterData,
  variationForAsin,
  parseVariationFromDom,
  hasDomVariationMarkers,
  looksLikeProductPage,
} from './variation-parser.js';
import { parseOrderItems, matchOrderItem } from './order-page-parser.js';
import { extractOptionsFromTitle } from './title-heuristics.js';
import { asinFromHref, marketplaceOf, orderDetailsUrl, productUrl } from './page-detector.js';
import { DAY_MS } from './cache.js';
import { dedupeByLabel } from './text.js';

/**
 * Decides where an item's selected options come from and fetches whatever is
 * missing:
 *
 *  1. the order details page, to find the item's ASIN when the page does not
 *     link it (return pages), matched by Amazon's line item id
 *  2. the product page for the ASIN (twister data), merged with any
 *     "Size: M" hints already on the page
 *  3. the product title, only when nothing authoritative could be reached
 *
 * All network access goes through the injected `fetchText`, at most a few
 * requests at a time, and results are cached per marketplace.
 */

export const SOURCES = Object.freeze({
  PAGE: 'page',
  PRODUCT: 'product',
  TITLE: 'title',
});

export const PRODUCT_TTL = 7 * DAY_MS;
export const ORDER_TTL = DAY_MS;
/** A product page that did not answer for this ASIN is retried after a day. */
export const NEGATIVE_TTL = DAY_MS;

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 * @typedef {{ options: OptionPair[], confirmed: boolean }} ProductResult
 * @typedef {{ options: OptionPair[], source: string, asin: string|null, title: string|null, retryable: boolean }} Resolution
 * @typedef {{ text: string, url: string }} FetchedPage
 */

/**
 * @param {Object} deps
 * @param {(url: string, init?: {credentials?: 'omit'|'include'}) => Promise<string|FetchedPage>} deps.fetchText
 * @param {{get: (k: string) => Promise<any>, set: (k: string, v: any, ttl: number) => Promise<void>}} deps.cache
 * @param {(html: string) => Document|null} [deps.parseHtml]
 * @param {{fetchProductPages?: boolean, fetchOrderPages?: boolean, useTitleHeuristics?: boolean}} [deps.settings]
 * @param {number} [deps.maxFetchesPerPage]
 * @param {number} [deps.maxConcurrent]
 */
export function createResolver({
  fetchText,
  cache,
  parseHtml = defaultParseHtml,
  settings = {},
  maxFetchesPerPage = 40,
  maxConcurrent = 3,
}) {
  const inflight = new Map();
  let fetchCount = 0;
  let active = 0;
  const waiting = [];

  const config = {
    fetchProductPages: settings.fetchProductPages !== false,
    fetchOrderPages: settings.fetchOrderPages !== false,
    useTitleHeuristics: settings.useTitleHeuristics !== false,
  };

  function acquire() {
    return new Promise((resolve) => {
      if (active < maxConcurrent) {
        active += 1;
        resolve();
      } else {
        waiting.push(resolve);
      }
    });
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  /**
   * Fetches a page at most once per URL and credential mode, a few at a time,
   * within the per-page cap. Failures resolve to null and are never cached.
   *
   * @param {string} url
   * @param {{credentials: 'omit'|'include'}} init
   * @returns {Promise<FetchedPage|null>}
   */
  function fetchOnce(url, init) {
    const key = `${init.credentials}:${url}`;
    if (inflight.has(key)) return inflight.get(key);
    if (fetchCount >= maxFetchesPerPage) return Promise.resolve(null);
    fetchCount += 1;
    const promise = (async () => {
      await acquire();
      try {
        const result = await fetchText(url, init);
        if (typeof result === 'string') return { text: result, url };
        if (result && typeof result.text === 'string') return { text: result.text, url: result.url || url };
        return null;
      } catch {
        return null;
      } finally {
        release();
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  /**
   * @param {string} origin
   * @param {string} asin
   * @returns {Promise<ProductResult|null>} null when nothing could be learned (not cached)
   */
  async function resolveByAsin(origin, asin) {
    if (!asin) return null;
    const key = `asin:${marketplaceOf(origin)}:${asin}`;
    const cached = await cache.get(key);
    if (Array.isArray(cached)) return { options: cached, confirmed: true };
    if (cached && Array.isArray(cached.options)) return { options: cached.options, confirmed: cached.confirmed !== false };
    if (!config.fetchProductPages) return null;

    const url = productUrl(origin, asin);
    // Product pages are public. An anonymous request keeps the lookup out of
    // the account's browsing history; the signed-in request is the fallback.
    let page = await fetchOnce(url, { credentials: 'omit' });
    if (!page || !looksLikeProductPage(page.text, asin)) page = await fetchOnce(url, { credentials: 'include' });
    if (!page || !looksLikeProductPage(page.text, asin)) return null;

    const landedOn = asinFromHref(page.url);
    const redirectedElsewhere = Boolean(landedOn && landedOn !== asin);
    const twister = parseTwisterData(page.text);

    let options = variationForAsin(twister, asin);
    if (options && options.length) {
      const result = { options, confirmed: true };
      await cache.set(key, result, PRODUCT_TTL);
      return result;
    }

    // The DOM shows whichever variation the page has selected, which is only
    // this ASIN when the page is really about it.
    const pageIsThisAsin = !redirectedElsewhere && (!twister || !twister.currentAsin || twister.currentAsin === asin);
    if (pageIsThisAsin && hasDomVariationMarkers(page.text)) {
      const doc = parseHtml(page.text);
      options = doc ? parseVariationFromDom(doc) : [];
    } else {
      options = [];
    }

    const confirmed = pageIsThisAsin;
    const result = { options: options || [], confirmed };
    await cache.set(key, result, confirmed ? PRODUCT_TTL : NEGATIVE_TTL);
    return result;
  }

  /**
   * @param {string} origin
   * @param {string} orderId
   * @returns {Promise<import('./order-page-parser.js').OrderItem[]|null>} null when the page could not be fetched
   */
  async function resolveOrderItems(origin, orderId) {
    if (!orderId) return [];
    const key = `order:${marketplaceOf(origin)}:${orderId}`;
    const cached = await cache.get(key);
    if (Array.isArray(cached) && cached.length) return cached;
    if (!config.fetchOrderPages) return [];

    const page = await fetchOnce(orderDetailsUrl(origin, orderId), { credentials: 'include' });
    if (!page) return null;
    const doc = parseHtml(page.text);
    const items = doc ? parseOrderItems(doc) : [];
    if (items.length) await cache.set(key, items, ORDER_TTL);
    return items;
  }

  /**
   * @param {Object} card
   * @param {string} card.origin
   * @param {string|null} [card.asin]
   * @param {string|null} [card.imageId]
   * @param {string|null} [card.title]
   * @param {string|null} [card.orderId]
   * @param {string|null} [card.lineItemId]
   * @param {OptionPair[]} [card.hints]
   * @returns {Promise<Resolution>}
   */
  async function resolveCard(card) {
    const hints = Array.isArray(card.hints) ? card.hints : [];
    let asin = card.asin || null;
    let fullTitle = null;
    let lookupFailed = false;

    if (!asin && card.orderId && (card.lineItemId || card.imageId || card.title)) {
      const items = await resolveOrderItems(card.origin, card.orderId);
      if (items === null) {
        lookupFailed = config.fetchOrderPages;
      } else {
        const match = matchOrderItem(items, { lineItemId: card.lineItemId, imageId: card.imageId, title: card.title });
        if (match) {
          asin = match.asin;
          fullTitle = match.title;
        }
      }
    }

    const product = asin ? await resolveByAsin(card.origin, asin) : null;
    const productUnknown = Boolean(asin && product === null && config.fetchProductPages);
    const retryable = productUnknown || lookupFailed;

    const merged = dedupeByLabel([...(product ? product.options : []), ...hints]);
    if (merged.length) {
      return { options: merged, source: product && product.options.length ? SOURCES.PRODUCT : SOURCES.PAGE, asin, title: fullTitle, retryable };
    }

    const confirmedNone = Boolean(product && product.confirmed);
    if (config.useTitleHeuristics && !confirmedNone) {
      const fromTitle = extractOptionsFromTitle(fullTitle || card.title);
      if (fromTitle.length) return { options: fromTitle, source: SOURCES.TITLE, asin, title: fullTitle, retryable };
    }

    return { options: [], source: SOURCES.PAGE, asin, title: fullTitle, retryable };
  }

  return {
    resolveCard,
    resolveByAsin,
    resolveOrderItems,
    get fetchCount() {
      return fetchCount;
    },
  };
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
  return dedupeByLabel([...(product || []), ...(hints || [])]);
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
