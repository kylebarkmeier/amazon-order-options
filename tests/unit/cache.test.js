import { describe, it, expect } from 'vitest';
import { createCache, createMemoryStore, DAY_MS } from '../../src/core/cache.js';

describe('createCache', () => {
  it('stores and retrieves values until they expire', async () => {
    let time = 1_000;
    const store = createMemoryStore();
    const cache = createCache({ store, now: () => time });

    expect(await cache.get('a')).toBeNull();
    await cache.set('a', { x: 1 }, 500);
    expect(await cache.get('a')).toEqual({ x: 1 });
    expect(await store.get('aoo:a')).toContain('"expires":1500');

    time = 1_499;
    expect(await cache.get('a')).toEqual({ x: 1 });
    time = 1_500;
    expect(await cache.get('a')).toBeNull();
    expect(await store.get('aoo:a')).toBeNull();
  });

  it('reads entries written by another instance and ignores corrupt ones', async () => {
    const store = createMemoryStore();
    const writer = createCache({ store, now: () => 0 });
    await writer.set('shared', 'value', DAY_MS);

    const reader = createCache({ store, now: () => 10 });
    expect(await reader.get('shared')).toBe('value');

    await store.set('aoo:corrupt', '{not json');
    expect(await reader.get('corrupt')).toBeNull();
    await store.set('aoo:noexpiry', JSON.stringify({ value: 1 }));
    expect(await reader.get('noexpiry')).toBeNull();
  });

  it('survives a failing store', async () => {
    const broken = {
      get: async () => {
        throw new Error('boom');
      },
      set: async () => {
        throw new Error('boom');
      },
      remove: async () => {
        throw new Error('boom');
      },
    };
    let time = 0;
    const cache = createCache({ store: broken, now: () => time });
    expect(await cache.get('k')).toBeNull();
    await cache.set('k', [1], 100);
    expect(await cache.get('k')).toEqual([1]);
    time = 200;
    expect(await cache.get('k')).toBeNull();
  });

  it('uses a custom prefix', async () => {
    const store = createMemoryStore();
    const cache = createCache({ store, prefix: 'p:' });
    await cache.set('k', 1, 1000);
    expect(await store.get('p:k')).not.toBeNull();
  });
});

describe('createMemoryStore', () => {
  it('behaves like a map', async () => {
    const store = createMemoryStore();
    expect(await store.get('x')).toBeNull();
    await store.set('x', '1');
    expect(await store.get('x')).toBe('1');
    await store.remove('x');
    expect(await store.get('x')).toBeNull();
  });
});
