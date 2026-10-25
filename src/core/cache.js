/**
 * Small TTL cache in front of a key/value store. The store is injected so the
 * same code runs on extension storage, Tampermonkey storage and plain
 * localStorage.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} KeyValueStore
 * @property {(key: string) => Promise<string|null|undefined>} get
 * @property {(key: string, value: string) => Promise<void>} set
 * @property {(key: string) => Promise<void>} remove
 */

/**
 * @param {Object} options
 * @param {KeyValueStore} options.store
 * @param {() => number} [options.now]
 * @param {string} [options.prefix]
 */
export function createCache({ store, now = () => Date.now(), prefix = 'aoo:' }) {
  const memory = new Map();

  /**
   * @template T
   * @param {string} key
   * @returns {Promise<T|null>}
   */
  async function get(key) {
    const full = prefix + key;
    let entry = memory.get(full);
    if (!entry) {
      let raw;
      try {
        raw = await store.get(full);
      } catch {
        raw = null;
      }
      if (!raw) return null;
      try {
        entry = JSON.parse(raw);
      } catch {
        return null;
      }
      memory.set(full, entry);
    }
    if (!entry || typeof entry.expires !== 'number' || entry.expires <= now()) {
      memory.delete(full);
      try {
        await store.remove(full);
      } catch {
        // ignore
      }
      return null;
    }
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @param {number} ttlMs
   */
  async function set(key, value, ttlMs) {
    const full = prefix + key;
    const entry = { value, expires: now() + ttlMs };
    memory.set(full, entry);
    try {
      await store.set(full, JSON.stringify(entry));
    } catch {
      // storage may be unavailable; the in-memory copy still works for this page
    }
  }

  return { get, set };
}

/**
 * Store backed by an in-memory Map. Used by tests and as a last resort.
 *
 * @returns {KeyValueStore}
 */
export function createMemoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}
