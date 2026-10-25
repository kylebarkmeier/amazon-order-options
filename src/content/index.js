import { detectPageType, getOrderIdFromUrl, PAGE_TYPES } from '../core/page-detector.js';
import { findItemCards, TRUNCATED_TITLE } from '../core/cards.js';
import { createResolver } from '../core/resolver.js';
import { createCache } from '../core/cache.js';
import { loadSettings } from '../core/settings.js';
import { createBadge, ensureStyles, placeBadge } from '../core/render.js';
import { createPlatformStore } from '../platform/storage.js';

/**
 * Entry point shared by the browser extensions and the userscript.
 * Scans the page for item cards, resolves each item's selected options and
 * inserts a badge. Re-scans when Amazon's single-page return flow changes the
 * DOM.
 */

const STATE_ATTR = 'data-aoo-state';

/**
 * @param {Object} [deps]
 * @param {Document} [deps.document]
 * @param {Window} [deps.window]
 * @param {(url: string) => Promise<string>} [deps.fetchText]
 * @param {import('../core/cache.js').KeyValueStore} [deps.store]
 * @returns {Promise<{rescan: () => Promise<void>, stop: () => void} | null>}
 */
export async function start(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const pageType = detectPageType(win.location.href);
  if (pageType === PAGE_TYPES.UNKNOWN) return null;

  const store = deps.store || createPlatformStore(win);
  const settings = await loadSettings(store);
  const isReturnsPage = [PAGE_TYPES.RETURNS_CART, PAGE_TYPES.RETURNS_PREP, PAGE_TYPES.RETURNS_OTHER, PAGE_TYPES.YOUR_RETURNS].includes(pageType);
  if (isReturnsPage && !settings.showOnReturns) return null;
  if (!isReturnsPage && !settings.showOnOrders) return null;

  const fetchText = deps.fetchText || ((url) => sameOriginFetch(win, url));
  const resolver = createResolver({ fetchText, cache: createCache({ store }), settings });
  const origin = win.location.origin;
  const orderId = getOrderIdFromUrl(win.location.href);

  ensureStyles(doc);

  let scanning = null;
  // Not an async function on purpose: callers must get the same in-flight promise.
  function rescan() {
    if (scanning) return scanning;
    scanning = (async () => {
      const cards = findItemCards(doc, pageType, { orderId }).filter((c) => !c.element.hasAttribute(STATE_ATTR));
      await Promise.all(cards.map((card) => processCard(card)));
    })().finally(() => {
      scanning = null;
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
        hints: card.hints,
      });
      if (!result) {
        card.element.setAttribute(STATE_ATTR, 'none');
        return;
      }
      if (settings.expandTitles && card.truncatedTitle) {
        const full = result.title || (TRUNCATED_TITLE.test(card.title || '') ? null : card.title);
        if (full && TRUNCATED_TITLE.test(card.truncatedTitle.textContent.trim())) {
          card.truncatedTitle.textContent = full;
        }
      }
      if (result.options.length) {
        const badge = createBadge(doc, result.options, {
          source: result.source,
          style: settings.badgeStyle,
          showSource: true,
        });
        placeBadge(card.anchorPoint, badge);
        card.element.setAttribute(STATE_ATTR, 'done');
      } else {
        card.element.setAttribute(STATE_ATTR, 'none');
      }
    } catch {
      card.element.setAttribute(STATE_ATTR, 'error');
    }
  }

  let timer = null;
  const observer = new win.MutationObserver((mutations) => {
    if (!mutations.some((m) => m.addedNodes.length || m.type === 'attributes')) return;
    if (mutations.every((m) => m.target.closest && m.target.closest('.aoo-badge'))) return;
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      timer = null;
      rescan();
    }, 350);
  });
  observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  await rescan();

  return {
    rescan,
    stop() {
      observer.disconnect();
      if (timer) win.clearTimeout(timer);
    },
  };
}

/**
 * @param {Window} win
 * @param {string} url
 * @returns {Promise<string>}
 */
async function sameOriginFetch(win, url) {
  const response = await win.fetch(url, { credentials: 'include', redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/* c8 ignore start */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__AOO_NO_AUTOSTART__) {
  const run = () => {
    start().catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
/* c8 ignore stop */
