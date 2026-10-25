/**
 * User settings with defaults. Storage is injected so the options page, the
 * content script and the userscript share one implementation.
 */

export const SETTINGS_KEY = 'aoo:settings';

export const DEFAULT_SETTINGS = Object.freeze({
  /** Show badges on the orders list and order details pages. */
  showOnOrders: true,
  /** Show badges on return pages. */
  showOnReturns: true,
  /** Fetch the product page to read the selected variation. */
  fetchProductPages: true,
  /** Fetch the order details page to find an item's ASIN when a return page hides it. */
  fetchOrderPages: true,
  /** Fall back to reading the size out of the title. */
  useTitleHeuristics: true,
  /** Replace truncated titles ("...") with the full title when it is known. */
  expandTitles: true,
  /** 'highlight' draws pills; 'plain' is text only. */
  badgeStyle: 'highlight',
});

/**
 * @param {unknown} raw
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (key === 'badgeStyle') {
      if (value === 'plain' || value === 'highlight') out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {import('./cache.js').KeyValueStore} store
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function loadSettings(store) {
  try {
    const raw = await store.get(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * @param {import('./cache.js').KeyValueStore} store
 * @param {Partial<typeof DEFAULT_SETTINGS>} settings
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function saveSettings(store, settings) {
  const normalized = normalizeSettings({ ...(await loadSettings(store)), ...settings });
  await store.set(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}
