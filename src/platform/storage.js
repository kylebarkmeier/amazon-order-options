/**
 * Picks a key/value store for the current runtime:
 *   - WebExtension storage (Firefox `browser.storage`, Chrome `chrome.storage`)
 *   - Tampermonkey / Violentmonkey `GM_*` storage
 *   - `localStorage` as the last resort
 *
 * The APIs are looked up on the given global object and, failing that, as
 * free identifiers in the script's own scope: Firefox content scripts expose
 * `browser` on the sandbox global rather than on the page window, and
 * userscript managers expose `GM_*` as scope bindings.
 *
 * @param {object} [globalObject]
 * @returns {import('../core/cache.js').KeyValueStore}
 */
export function createPlatformStore(globalObject = globalThis) {
  const ext = extensionStorage(globalObject);
  if (ext) return ext;

  const gm = userscriptStorage(globalObject);
  if (gm) return gm;

  return localStorageStore(globalObject);
}

/**
 * @param {object} globalObject
 * @returns {{api: object, runtime: object|null}|null}
 */
function findExtensionApi(globalObject) {
  const candidates = [globalObject && globalObject.browser, globalObject && globalObject.chrome];
  try {
    if (typeof browser !== 'undefined') candidates.push(browser);
  } catch {
    // not defined in this scope
  }
  try {
    if (typeof chrome !== 'undefined') candidates.push(chrome);
  } catch {
    // not defined in this scope
  }
  for (const candidate of candidates) {
    if (candidate && candidate.storage && candidate.storage.local) {
      return { api: candidate.storage.local, runtime: candidate.runtime || null };
    }
  }
  return null;
}

/**
 * @param {object} globalObject
 * @returns {import('../core/cache.js').KeyValueStore|null}
 */
function extensionStorage(globalObject) {
  const found = findExtensionApi(globalObject);
  if (!found) return null;
  const { api, runtime } = found;
  const call = (method, arg) =>
    new Promise((resolve, reject) => {
      try {
        const maybe = api[method](arg, (result) => {
          const err = runtime && runtime.lastError;
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
 * @param {object} globalObject
 * @returns {{get: Function, set: Function, remove: Function|null}|null}
 */
function findGmApi(globalObject) {
  if (globalObject && typeof globalObject.GM_getValue === 'function' && typeof globalObject.GM_setValue === 'function') {
    return { get: globalObject.GM_getValue, set: globalObject.GM_setValue, remove: globalObject.GM_deleteValue || null };
  }
  try {
    if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
      return { get: GM_getValue, set: GM_setValue, remove: typeof GM_deleteValue === 'function' ? GM_deleteValue : null };
    }
  } catch {
    // not defined in this scope
  }
  return null;
}

/**
 * @param {object} globalObject
 * @returns {import('../core/cache.js').KeyValueStore|null}
 */
function userscriptStorage(globalObject) {
  const gm = findGmApi(globalObject);
  if (!gm) return null;
  return {
    async get(key) {
      const value = gm.get(key, null);
      return value === undefined ? null : value;
    },
    async set(key, value) {
      gm.set(key, value);
    },
    async remove(key) {
      if (gm.remove) gm.remove(key);
      else gm.set(key, null);
    },
  };
}

/**
 * @param {object} globalObject
 * @returns {import('../core/cache.js').KeyValueStore}
 */
export function localStorageStore(globalObject = globalThis) {
  const memory = new Map();
  const ls = () => {
    try {
      return (globalObject && globalObject.localStorage) || null;
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
