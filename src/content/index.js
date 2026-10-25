import { detectPageType, getLineItemIdFromUrl, getOrderIdFromUrl, PAGE_TYPES } from '../core/page-detector.js';
import { findItemCards } from '../core/cards.js';
import { createResolver } from '../core/resolver.js';
import { createCache } from '../core/cache.js';
import { loadSettings } from '../core/settings.js';
import { applyTheme, createBadge, ensureStyles, placeBadge } from '../core/render.js';
import { BADGE_CLASS } from '../core/selectors.js';
import { TRUNCATED_TITLE } from '../core/text.js';
import { createPlatformStore } from '../platform/storage.js';

/**
 * Entry point shared by the browser extensions and the userscript.
 * Scans the page for item cards, resolves each item's selected options and
 * inserts a badge. Re-scans when Amazon's single-page return flow changes the
 * DOM, and retries items whose lookups failed for a transient reason.
 */

export const STATE_ATTR = 'data-aoo-state';
const RETRY_ATTR = 'data-aoo-retries';
const MAX_RETRIES = 3;
const DEBOUNCE_MS = 350;

/**
 * @param {Object} [deps]
 * @param {Document} [deps.document]
 * @param {Window} [deps.window]
 * @param {object} [deps.globalObject] where extension or userscript APIs live; defaults to globalThis
 * @param {(url: string, init?: object) => Promise<string|{text: string, url: string}>} [deps.fetchText]
 * @param {import('../core/cache.js').KeyValueStore} [deps.store]
 * @param {ReturnType<typeof createResolver>} [deps.resolver] replaces the built-in resolver (tests)
 * @param {number} [deps.retryDelayMs]
 * @returns {Promise<{rescan: () => Promise<void>, stop: () => void} | null>}
 */
export async function start(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const pageType = detectPageType(win.location.href);
  if (pageType === PAGE_TYPES.UNKNOWN) return null;

  // Extension and userscript APIs are globals of the script's own scope, not
  // properties of the page window (Firefox content scripts, Tampermonkey).
  const store = deps.store || createPlatformStore(deps.globalObject || globalThis);
  const settings = await loadSettings(store);
  const isReturnsPage = [PAGE_TYPES.RETURNS_CART, PAGE_TYPES.RETURNS_PREP, PAGE_TYPES.RETURNS_OTHER, PAGE_TYPES.YOUR_RETURNS].includes(pageType);
  if (isReturnsPage && !settings.showOnReturns) return null;
  if (!isReturnsPage && !settings.showOnOrders) return null;

  const fetchText = deps.fetchText || ((url, init) => sameOriginFetch(win, url, init));
  const resolver = deps.resolver || createResolver({ fetchText, cache: createCache({ store }), settings });
  const origin = win.location.origin;
  const orderId = getOrderIdFromUrl(win.location.href);
  const lineItemId = getLineItemIdFromUrl(win.location.href);
  const retryDelayMs = deps.retryDelayMs ?? 30_000;

  ensureStyles(doc);
  applyTheme(doc, win);

  /**
   * Cards already handled are skipped before any work is done on them. A card
   * marked done whose badge Amazon has since re-rendered away is handled again.
   *
   * @param {Element} card
   * @returns {boolean}
   */
  function skip(card) {
    const state = card.getAttribute(STATE_ATTR);
    if (!state) return false;
    if (state === 'done' && !card.querySelector(`.${BADGE_CLASS}`)) {
      card.removeAttribute(STATE_ATTR);
      return false;
    }
    return true;
  }

  let scanning = null;
  let rescanWanted = false;
  // Not an async function on purpose: callers get the same in-flight promise,
  // and a request made during a scan runs once that scan settles.
  function rescan() {
    if (scanning) {
      rescanWanted = true;
      return scanning;
    }
    scanning = (async () => {
      const cards = findItemCards(doc, pageType, { orderId, lineItemId, skip });
      await Promise.all(cards.map((card) => processCard(card)));
    })().finally(() => {
      scanning = null;
      if (rescanWanted) {
        rescanWanted = false;
        rescan();
      }
    });
    return scanning;
  }

  /**
   * @param {import('../core/cards.js').CardInfo} card
   */
  async function processCard(card) {
    card.element.setAttribute(STATE_ATTR, 'pending');
    try {
      const result = await resolver.resolveCard({
        origin,
        asin: card.asin,
        imageId: card.imageId,
        title: card.title,
        orderId: card.orderId,
        lineItemId: card.lineItemId,
        hints: card.hints,
      });

      if (settings.expandTitles && card.truncatedTitle) {
        const full = result.title || (TRUNCATED_TITLE.test(card.title || '') ? null : card.title);
        if (full && TRUNCATED_TITLE.test(card.truncatedTitle.textContent.trim())) {
          card.truncatedTitle.textContent = full;
        }
      }

      if (result.options.length) {
        const badge = createBadge(doc, result.options, { source: result.source, style: settings.badgeStyle, showSource: true });
        placeBadge(card.anchorPoint, badge);
        card.element.setAttribute(STATE_ATTR, 'done');
        if (result.retryable && result.source === SOURCES_TITLE) scheduleRetry(card.element);
      } else if (result.retryable) {
        scheduleRetry(card.element);
      } else {
        card.element.setAttribute(STATE_ATTR, 'none');
      }
    } catch {
      card.element.setAttribute(STATE_ATTR, 'error');
    }
  }

  const SOURCES_TITLE = 'title';
  const retryTimers = new Set();

  /**
   * Lets a later rescan try the card again after a transient failure.
   *
   * @param {Element} el
   */
  function scheduleRetry(el) {
    const attempts = Number(el.getAttribute(RETRY_ATTR) || 0);
    if (attempts >= MAX_RETRIES) {
      if (el.getAttribute(STATE_ATTR) !== 'done') el.setAttribute(STATE_ATTR, 'none');
      return;
    }
    el.setAttribute(RETRY_ATTR, String(attempts + 1));
    if (el.getAttribute(STATE_ATTR) !== 'done') el.setAttribute(STATE_ATTR, 'retry');
    const timer = win.setTimeout(() => {
      retryTimers.delete(timer);
      el.removeAttribute(STATE_ATTR);
      rescan();
    }, retryDelayMs);
    retryTimers.add(timer);
  }

  let timer = null;
  const observer = new win.MutationObserver((mutations) => {
    if (!mutations.some(isRelevantMutation)) return;
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      timer = null;
      rescan();
    }, DEBOUNCE_MS);
  });
  observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  await rescan();

  return {
    rescan,
    stop() {
      observer.disconnect();
      if (timer) win.clearTimeout(timer);
      for (const t of retryTimers) win.clearTimeout(t);
      retryTimers.clear();
    },
  };
}

/**
 * Only mutations that can introduce or reveal an item matter: elements added
 * that are not the extension's own badges, and class/hidden changes on
 * elements holding images. Text-only changes (title expansion) do not count.
 *
 * @param {MutationRecord} m
 * @returns {boolean}
 */
export function isRelevantMutation(m) {
  const target = m.target;
  if (!target || target.nodeType !== 1 || (target.closest && target.closest(`.${BADGE_CLASS}`))) return false;
  if (m.type === 'childList') {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.classList && node.classList.contains(BADGE_CLASS)) continue;
      return true;
    }
    return false;
  }
  return target.tagName === 'IMG' || Boolean(target.querySelector && target.querySelector('img'));
}

/**
 * @param {Window} win
 * @param {string} url
 * @param {{credentials?: 'omit'|'include'}} [init]
 * @returns {Promise<{text: string, url: string}>}
 */
async function sameOriginFetch(win, url, init = {}) {
  const response = await win.fetch(url, { credentials: init.credentials || 'include', redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), url: response.url || url };
}

/* c8 ignore start */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !globalThis.__AOO_NO_AUTOSTART__) {
  const run = () => {
    start().catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
/* c8 ignore stop */
