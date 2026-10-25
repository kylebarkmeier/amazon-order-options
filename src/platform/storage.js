/**
 * Picks a key/value store for the current runtime:
 *   - WebExtension storage (Firefox `browser.storage`, Chrome `chrome.storage`)
 *   - Tampermonkey / Greasemonkey `GM_*` storage
 *   - `localStorage` as the last resort
 *
 * @returns {import('../core/cache.js').KeyValueStore}
 */
export function createPlatformStore(globalObject = globalThis) {
  const ext = extensionStorage(globalObject);
  if (ext) return ext;

  if (typeof globalObject.GM_getValue === 'function' && typeof globalObject.GM_setValue === 'function') {
    return {
      async get(key) {
        const value = globalObject.GM_getValue(key, null);
        return value === undefined ? null : value;
      },
      async set(key, value) {
        globalObject.GM_setValue(key, value);
      },
      async remove(key) {
        if (typeof globalObject.GM_deleteValue === 'function') globalObject.GM_deleteValue(key);
        else globalObject.GM_setValue(key, null);
      },
    };
  }

  return localStorageStore(globalObject);
}

/**
 * @param {typeof globalThis} globalObject
 * @returns {import('../core/cache.js').KeyValueStore|null}
 */
function extensionStorage(globalObject) {
  const api = globalObject.browser?.storage?.local || globalObject.chrome?.storage?.local;
  if (!api) return null;
  const call = (method, arg) =>
    new Promise((resolve, reject) => {
      try {
        const maybe = api[method](arg, (result) => {
          const err = globalObject.chrome?.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(result);
        });
        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  return {
    async get(key) {
      const result = await call('get', key);
      return result && key in result ? result[key] : null;
    },
    async set(key, value) {
      await call('set', { [key]: value });
    },
    async remove(key) {
      await call('remove', key);
    },
  };
}

/**
 * @param {typeof globalThis} globalObject
 * @returns {import('../core/cache.js').KeyValueStore}
 */
export function localStorageStore(globalObject = globalThis) {
  const memory = new Map();
  const ls = () => {
    try {
      return globalObject.localStorage || null;
    } catch {
      return null;
    }
  };
  return {
    async get(key) {
      const store = ls();
      if (store) {
        try {
          return store.getItem(key);
        } catch {
          // fall through
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    async set(key, value) {
      const store = ls();
      if (store) {
        try {
          store.setItem(key, value);
          return;
        } catch {
          // fall through
        }
      }
      memory.set(key, value);
    },
    async remove(key) {
      const store = ls();
      if (store) {
        try {
          store.removeItem(key);
        } catch {
          // ignore
        }
      }
      memory.delete(key);
    },
  };
}
