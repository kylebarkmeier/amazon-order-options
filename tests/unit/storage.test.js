import { describe, it, expect, vi } from 'vitest';
import { createPlatformStore, localStorageStore } from '../../src/platform/storage.js';

function fakeChromeStorage({ promise = false, failWith = null } = {}) {
  const data = {};
  const lastError = { value: null };
  const impl = {
    get(key, cb) {
      lastError.value = failWith;
      const result = { [key]: data[key] };
      if (!(key in data)) delete result[key];
      if (promise) return failWith ? Promise.reject(new Error(failWith)) : Promise.resolve(result);
      cb(result);
      return undefined;
    },
    set(obj, cb) {
      Object.assign(data, obj);
      if (promise) return Promise.resolve();
      cb();
      return undefined;
    },
    remove(key, cb) {
      delete data[key];
      if (promise) return Promise.resolve();
      cb();
      return undefined;
    },
  };
  return { data, lastError, api: { storage: { local: impl } } };
}

describe('createPlatformStore', () => {
  it('uses callback-style chrome storage', async () => {
    const chrome = fakeChromeStorage();
    const store = createPlatformStore({
      chrome: {
        ...chrome.api,
        runtime: {
          get lastError() {
            return chrome.lastError.value ? { message: chrome.lastError.value } : null;
          },
        },
      },
    });
    expect(await store.get('k')).toBeNull();
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
  });

  it('uses promise-style browser storage', async () => {
    const fake = fakeChromeStorage({ promise: true });
    const store = createPlatformStore({ browser: fake.api });
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(await store.get('missing')).toBeNull();
  });

  it('rejects on runtime.lastError and on thrown errors', async () => {
    const chrome = fakeChromeStorage({ failWith: 'quota' });
    const store = createPlatformStore({
      chrome: {
        ...chrome.api,
        runtime: {
          get lastError() {
            return chrome.lastError.value ? { message: chrome.lastError.value } : null;
          },
        },
      },
    });
    await expect(store.get('k')).rejects.toThrow('quota');

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

  it('uses GM storage when present', async () => {
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
  });
});
