import { describe, it, expect, afterEach, vi } from 'vitest';
import { createPlatformStore, localStorageStore } from '../../src/platform/storage.js';

function fakeStorage({ promise = false, failOn = [] } = {}) {
  const data = {};
  const lastError = { value: null };
  const wrap = (method, fn) => (arg, cb) => {
    lastError.value = failOn.includes(method) ? `${method} failed` : null;
    if (promise) return lastError.value ? Promise.reject(new Error(lastError.value)) : Promise.resolve(fn(arg));
    cb(fn(arg));
    return undefined;
  };
  const impl = {
    get: wrap('get', (key) => (key in data ? { [key]: data[key] } : {})),
    set: wrap('set', (obj) => Object.assign(data, obj)),
    remove: wrap('remove', (key) => delete data[key]),
  };
  const runtime = {
    get lastError() {
      return lastError.value ? { message: lastError.value } : null;
    },
  };
  return { data, api: { storage: { local: impl }, runtime } };
}

afterEach(() => {
  delete globalThis.browser;
  delete globalThis.chrome;
  delete globalThis.GM_getValue;
  delete globalThis.GM_setValue;
  delete globalThis.GM_deleteValue;
});

describe('createPlatformStore', () => {
  it('uses callback-style chrome storage', async () => {
    const store = createPlatformStore({ chrome: fakeStorage().api });
    expect(await store.get('k')).toBeNull();
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
  });

  it('uses promise-style browser storage and prefers it over chrome when both exist', async () => {
    const browser = fakeStorage({ promise: true });
    const chrome = fakeStorage();
    const store = createPlatformStore({ browser: browser.api, chrome: chrome.api });
    await store.set('k', 'v');
    expect(browser.data.k).toBe('v');
    expect(chrome.data.k).toBeUndefined();
    expect(await store.get('missing')).toBeNull();
  });

  it('finds the extension API as a free identifier when the page window has none (Firefox content scripts)', async () => {
    globalThis.browser = fakeStorage({ promise: true }).api;
    const store = createPlatformStore({ localStorage: { getItem: () => 'wrong' } });
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(globalThis.browser.storage.local.get.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects on runtime.lastError for set and remove as well as get, and on thrown errors', async () => {
    const failing = createPlatformStore({ chrome: fakeStorage({ failOn: ['get', 'set', 'remove'] }).api });
    await expect(failing.get('k')).rejects.toThrow('get failed');
    await expect(failing.set('k', 'v')).rejects.toThrow('set failed');
    await expect(failing.remove('k')).rejects.toThrow('remove failed');

    const promiseFailing = createPlatformStore({ browser: fakeStorage({ promise: true, failOn: ['set'] }).api });
    await expect(promiseFailing.set('k', 'v')).rejects.toThrow('set failed');

    const throwing = createPlatformStore({
      chrome: {
        storage: {
          local: {
            get() {
              throw new Error('sync throw');
            },
          },
        },
      },
    });
    await expect(throwing.get('k')).rejects.toThrow('sync throw');
  });

  it('uses GM storage when present on the global object', async () => {
    const values = {};
    const g = {
      GM_getValue: (k, d) => (k in values ? values[k] : d),
      GM_setValue: (k, v) => {
        values[k] = v;
      },
      GM_deleteValue: (k) => {
        delete values[k];
      },
    };
    const store = createPlatformStore(g);
    expect(await store.get('k')).toBeNull();
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    await store.remove('k');
    expect(values).toEqual({});

    const noDelete = createPlatformStore({ GM_getValue: g.GM_getValue, GM_setValue: g.GM_setValue });
    await noDelete.set('k', 'v');
    await noDelete.remove('k');
    expect(values.k).toBeNull();
    expect(await noDelete.get('k')).toBeNull();
  });

  it('uses GM storage exposed as scope bindings (userscript sandboxes)', async () => {
    const values = {};
    globalThis.GM_getValue = (k, d) => (k in values ? values[k] : d);
    globalThis.GM_setValue = (k, v) => {
      values[k] = v;
    };
    const store = createPlatformStore({});
    await store.set('k', 'v');
    expect(values.k).toBe('v');
    expect(await store.get('k')).toBe('v');
    await store.remove('k');
    expect(values.k).toBeNull();
  });

  it('falls back to localStorage', async () => {
    const store = createPlatformStore(window);
    await store.set('aoo-test', '1');
    expect(window.localStorage.getItem('aoo-test')).toBe('1');
    expect(await store.get('aoo-test')).toBe('1');
    await store.remove('aoo-test');
    expect(await store.get('aoo-test')).toBeNull();
  });
});

describe('localStorageStore', () => {
  it('keeps values in memory when localStorage is unavailable or throws', async () => {
    const noLs = localStorageStore({});
    await noLs.set('k', 'v');
    expect(await noLs.get('k')).toBe('v');
    await noLs.remove('k');
    expect(await noLs.get('k')).toBeNull();

    const throwing = localStorageStore({
      get localStorage() {
        throw new Error('blocked');
      },
    });
    await throwing.set('k', 'v');
    expect(await throwing.get('k')).toBe('v');

    const quota = localStorageStore({
      localStorage: {
        getItem: vi.fn(() => {
          throw new Error('x');
        }),
        setItem: vi.fn(() => {
          throw new Error('x');
        }),
        removeItem: vi.fn(() => {
          throw new Error('x');
        }),
      },
    });
    await quota.set('k', 'v');
    expect(await quota.get('k')).toBe('v');
    await quota.remove('k');
    expect(await quota.get('k')).toBeNull();
    expect(await localStorageStore(null).get('k')).toBeNull();
  });
});
